"""Who may talk to an AI, and when. Enforced on every call."""

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AIAuditLog, AIProfile, Audience, Provider
from app.core.settings import get_settings
from app.users.models import TeamMember


def is_ready(profile: AIProfile | None) -> bool:
    """Active and usable (a key is needed except for local Ollama models)."""
    return bool(
        profile
        and profile.active
        and profile.model
        and (profile.api_key_encrypted or profile.provider == Provider.OLLAMA)
    )


async def may_talk(db: AsyncSession, profile: AIProfile, caller_id: uuid.UUID) -> bool:
    if caller_id == profile.user_id:
        return True
    match profile.audience:
        case Audience.EVERYONE:
            return True
        case Audience.PEOPLE:
            return str(caller_id) in profile.allowed_user_ids
        case Audience.TEAMS:
            if not profile.allowed_team_ids:
                return False
            found = await db.scalar(
                select(TeamMember.id).where(
                    TeamMember.user_id == caller_id,
                    TeamMember.team_id.in_([uuid.UUID(t) for t in profile.allowed_team_ids]),
                )
            )
            return found is not None
        case _:
            return False


def within_hours(profile: AIProfile, now: datetime) -> bool:
    if profile.hours_start is None or profile.hours_end is None:
        return True
    hour = now.astimezone(ZoneInfo(get_settings().timezone)).hour
    start, end = profile.hours_start, profile.hours_end
    return start <= hour < end if start <= end else hour >= start or hour < end  # overnight


async def tokens_used_today(db: AsyncSession, owner_id: uuid.UUID, now: datetime) -> int:
    day_start = now.astimezone(ZoneInfo(get_settings().timezone)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    used = await db.scalar(
        select(func.coalesce(func.sum(AIAuditLog.tokens_in + AIAuditLog.tokens_out), 0)).where(
            AIAuditLog.owner_id == owner_id, AIAuditLog.created_at >= day_start
        )
    )
    return int(used or 0)
