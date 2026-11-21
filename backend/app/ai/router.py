import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import rules
from app.ai.models import AIAuditLog, AIConversation, AIMessage, AIProfile
from app.ai.prompt import build_messages
from app.ai.provider import LLM, MAX_TOKENS, ModelRequest, get_llm
from app.ai.schemas import AIMessageOut, AskIn, LogThread, ProfileOut, ProfileUpdate, ThreadOut
from app.auth.deps import DB, CurrentUser
from app.core import clock
from app.core.crypto import decrypt, encrypt
from app.core.errors import AppError
from app.core.ratelimit import RateLimiter
from app.core.settings import get_settings
from app.tasks.models import Task
from app.users.models import User

router = APIRouter(prefix="/ai", tags=["ai"])

HISTORY = 20
_s = get_settings()
caller_limiter = RateLimiter(_s.ai_caller_per_minute, 60)
owner_limiter = RateLimiter(_s.ai_owner_per_hour, 3600)


def _profile_out(p: AIProfile) -> ProfileOut:
    return ProfileOut(
        active=p.active,
        provider=p.provider,
        model=p.model,
        has_api_key=p.api_key_encrypted is not None,
        system_prompt=p.system_prompt,
        default_prompt=p.default_prompt,
        language=p.language,
        tone=p.tone,
        length=p.length,
        hours_start=p.hours_start,
        hours_end=p.hours_end,
        audience=p.audience,
        allowed_user_ids=[uuid.UUID(u) for u in p.allowed_user_ids],
        allowed_team_ids=[uuid.UUID(t) for t in p.allowed_team_ids],
        share_tasks=p.share_tasks,
        ready=rules.is_ready(p),
    )


async def _get_profile(db: AsyncSession, user_id: uuid.UUID) -> AIProfile | None:
    return await db.scalar(select(AIProfile).where(AIProfile.user_id == user_id))


@router.get("/profile", response_model=ProfileOut)
async def get_my_profile(user: CurrentUser, db: DB) -> ProfileOut:
    profile = await _get_profile(db, user.id)
    if profile is None:  # not configured yet: the safe defaults
        defaults = ProfileUpdate(
            language=user.locale if user.locale in ("fr", "en", "ar") else "fr"
        )
        return ProfileOut(
            **defaults.model_dump(exclude={"api_key", "clear_api_key"}),
            has_api_key=False,
            ready=False,
        )
    return _profile_out(profile)


@router.put("/profile", response_model=ProfileOut)
async def update_my_profile(body: ProfileUpdate, user: CurrentUser, db: DB) -> ProfileOut:
    profile = await _get_profile(db, user.id)
    if profile is None:
        profile = AIProfile(user_id=user.id)
        db.add(profile)
    data = body.model_dump(exclude={"api_key", "clear_api_key"})
    data["allowed_user_ids"] = [str(u) for u in body.allowed_user_ids]
    data["allowed_team_ids"] = [str(t) for t in body.allowed_team_ids]
    for field, value in data.items():
        setattr(profile, field, value)
    if body.clear_api_key:
        profile.api_key_encrypted = None
    elif body.api_key:
        profile.api_key_encrypted = encrypt(body.api_key.strip())
    await db.commit()
    return _profile_out(profile)


async def _thread(db: AsyncSession, owner_id: uuid.UUID, caller_id: uuid.UUID) -> AIConversation:
    thread = await db.scalar(
        select(AIConversation).where(
            AIConversation.owner_id == owner_id, AIConversation.caller_id == caller_id
        )
    )
    if thread is None:
        thread = AIConversation(owner_id=owner_id, caller_id=caller_id)
        db.add(thread)
        await db.flush()
    return thread


async def _messages(db: AsyncSession, thread_id: uuid.UUID, limit: int) -> list[AIMessage]:
    rows = await db.scalars(
        select(AIMessage)
        .where(AIMessage.ai_conversation_id == thread_id)
        .order_by(AIMessage.seq.desc())
        .limit(limit)
    )
    return list(reversed(list(rows)))


async def _allowed_profile(db: AsyncSession, owner_id: uuid.UUID, caller: User) -> AIProfile:
    """404 when the caller may not talk to this AI (hidden, like any other resource)."""
    profile = await _get_profile(db, owner_id)
    if profile is None or not await rules.may_talk(db, profile, caller.id):
        raise AppError("not_found", "AI not found", 404)
    return profile


@router.get("/{owner_id}/thread", response_model=ThreadOut)
async def get_thread(owner_id: uuid.UUID, user: CurrentUser, db: DB) -> ThreadOut:
    if owner_id == user.id and await _get_profile(db, user.id) is None:
        # My own assistant, not configured yet: empty and unavailable (not "not found").
        return ThreadOut(owner_id=owner_id, available=False, messages=[])
    profile = await _allowed_profile(db, owner_id, user)
    thread = await db.scalar(
        select(AIConversation).where(
            AIConversation.owner_id == owner_id, AIConversation.caller_id == user.id
        )
    )
    messages = await _messages(db, thread.id, 100) if thread else []
    available = rules.is_ready(profile) and rules.within_hours(profile, clock.now())
    return ThreadOut(
        owner_id=owner_id,
        available=available,
        messages=[AIMessageOut.model_validate(m) for m in messages],
    )


@router.post("/{owner_id}/messages", response_model=AIMessageOut, status_code=201)
async def ask(
    owner_id: uuid.UUID,
    body: AskIn,
    user: CurrentUser,
    db: DB,
    llm: Annotated[LLM, Depends(get_llm)],
) -> AIMessage:
    profile = await _allowed_profile(db, owner_id, user)
    now = clock.now()
    if not rules.is_ready(profile):
        raise AppError("ai_inactive", "This AI is not active", 409)
    if not rules.within_hours(profile, now):
        raise AppError("ai_outside_hours", "This AI is not available at this time", 409)
    if not caller_limiter.hit(f"{user.id}:{owner_id}") or not owner_limiter.hit(str(owner_id)):
        raise AppError("rate_limited", "Too many AI requests, try again later", 429)
    if await rules.tokens_used_today(db, owner_id, now) >= get_settings().ai_daily_token_budget:
        raise AppError("ai_budget_exceeded", "Daily AI budget reached", 429)

    owner = await db.get(User, owner_id)
    assert owner is not None
    thread = await _thread(db, owner_id, user.id)
    history = await _messages(db, thread.id, HISTORY)
    tasks = None
    if profile.share_tasks:  # only what the owner explicitly shared
        tasks = list(
            await db.scalars(
                select(Task).where(Task.assignee_id == owner_id).order_by(Task.status).limit(100)
            )
        )
    request = ModelRequest(
        provider=profile.provider,
        model=profile.model,
        api_key=decrypt(profile.api_key_encrypted) if profile.api_key_encrypted else None,
        messages=build_messages(profile, owner, user, history, body.content, tasks),
        max_tokens=MAX_TOKENS[profile.length],
    )

    started = time.monotonic()
    audit = AIAuditLog(
        owner_id=owner_id,
        caller_id=user.id,
        provider=profile.provider.value,
        model=profile.model,
        status="ok",
    )
    try:
        result = await llm(request)
    except Exception as exc:
        audit.status = "error"
        audit.details = {"error": type(exc).__name__}  # never the key or message content
        audit.duration_ms = int((time.monotonic() - started) * 1000)
        db.add(audit)
        await db.commit()
        raise AppError("ai_provider_error", "The AI provider did not answer", 502) from exc

    audit.tokens_in, audit.tokens_out, audit.cost = result.tokens_in, result.tokens_out, result.cost
    audit.duration_ms = int((time.monotonic() - started) * 1000)
    db.add(audit)
    db.add(AIMessage(ai_conversation_id=thread.id, role="user", content=body.content))
    await db.flush()
    answer = AIMessage(
        ai_conversation_id=thread.id,
        role="assistant",
        content=result.text,
        provider=profile.provider.value,
        model=profile.model,
    )
    db.add(answer)
    await db.commit()
    return answer


@router.get("/log", response_model=list[LogThread])
async def my_ai_log(user: CurrentUser, db: DB) -> list[LogThread]:
    """The owner reads every conversation anyone had with their AI."""
    threads = await db.scalars(
        select(AIConversation)
        .where(AIConversation.owner_id == user.id)
        .order_by(AIConversation.updated_at.desc())
    )
    return [
        LogThread(
            caller_id=t.caller_id,
            messages=[AIMessageOut.model_validate(m) for m in await _messages(db, t.id, 200)],
        )
        for t in threads
    ]
