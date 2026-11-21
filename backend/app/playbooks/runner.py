"""Runs a playbook: build reports, wait for approval if needed, deliver, retry on failure."""

import time
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import LLM
from app.core.settings import get_settings
from app.playbooks import report
from app.playbooks.ai import owner_ai_ready, rewrite
from app.playbooks.models import Playbook, PlaybookKind, PlaybookRun, RunStatus
from app.playbooks.schedule import period
from app.projects.access import visible_projects
from app.reminders.models import Notification, NotificationType
from app.reminders.notify import notify, push
from app.users.models import User

MAX_ATTEMPTS = 3


def recipients_of(p: Playbook) -> list[uuid.UUID]:
    return [uuid.UUID(r) for r in p.recipient_ids] or [p.owner_id]


async def _names(db: AsyncSession) -> dict[uuid.UUID, str]:
    rows = await db.execute(select(User.id, User.display_name))
    return {uid: name for uid, name in rows.all()}


async def build(db: AsyncSession, run: PlaybookRun, p: Playbook, now: datetime, llm: LLM) -> None:
    """Fill run.outputs (one report per recipient). Raises if the AI provider fails."""
    owner = await db.get(User, p.owner_id)
    assert owner is not None
    today = now.astimezone(ZoneInfo(get_settings().timezone)).date()
    scope = [uuid.UUID(s) for s in p.scope_user_ids]
    names = await _names(db)
    projects = {pr.id: pr.name for pr in await db.scalars(visible_projects(owner))}
    team = await report.collect(db, owner, scope, run.period_start, run.period_end, today)
    ai_profile = await owner_ai_ready(db, owner, now) if p.use_ai else None

    outputs: dict[str, str] = {}
    rewritten: dict[str, str] = {}  # same text -> same AI answer (saves tokens)
    for rid in recipients_of(p):
        recipient = await db.get(User, rid)
        if recipient is None or not recipient.is_active:
            continue
        lang = recipient.locale if recipient.locale in report.LABELS else "fr"
        personal = p.kind == PlaybookKind.MONDAY_SUMMARY and not (
            report.sees_team(recipient) and report.sees_team(owner)
        )
        data = (
            await report.collect(db, owner, [rid], run.period_start, run.period_end, today)
            if personal
            else team
        )
        text = report.render(
            p, data, names, run.period_start, run.period_end, lang, personal, projects
        )
        if ai_profile is not None:
            if text not in rewritten:
                result = await rewrite(
                    db, ai_profile, owner, text, p.instructions, lang, llm, p.name
                )
                rewritten[text] = result.text
                run.tokens += result.tokens_in + result.tokens_out
                run.cost += result.cost
            text = rewritten[text]
        outputs[str(rid)] = text

    run.outputs = outputs
    run.recipient_ids = list(outputs)
    run.inputs = {"counts": team.counts(), "scope": p.scope_user_ids, "ai": ai_profile is not None}


async def deliver(db: AsyncSession, run: PlaybookRun, p: Playbook) -> list[Notification | None]:
    created = []
    for rid, text in run.outputs.items():
        created.append(
            await notify(
                db,
                uuid.UUID(rid),
                NotificationType.REPORT,
                p.name,
                body=text,
                link=f"/reports/{run.id}",
                allow_in_app=p.deliver_in_app,
                allow_email=p.deliver_email,
            )
        )
    run.status = RunStatus.DELIVERED
    return created


async def attempt(
    db: AsyncSession, run: PlaybookRun, p: Playbook, now: datetime, llm: LLM
) -> list[Notification | None]:
    """One try at building (and delivering) a run. Never raises."""
    started = time.monotonic()
    run.attempts += 1
    try:
        await build(db, run, p, now, llm)
    except Exception as exc:
        run.status = RunStatus.FAILED
        run.error = type(exc).__name__
        run.duration_ms = int((time.monotonic() - started) * 1000)
        if run.attempts < MAX_ATTEMPTS:
            run.next_retry_at = now + timedelta(minutes=5 * 2 ** (run.attempts - 1))
            return []
        run.next_retry_at = None
        return [
            await notify(
                db, p.owner_id, NotificationType.REPORT, p.name, body="❌ failed", link="/playbooks"
            )
        ]
    run.error = None
    run.next_retry_at = None
    run.duration_ms = int((time.monotonic() - started) * 1000)
    if p.approval_required:
        run.status = RunStatus.AWAITING_APPROVAL
        return [
            await notify(
                db, p.owner_id, NotificationType.APPROVAL, p.name, link=f"/reports/{run.id}"
            )
        ]
    return await deliver(db, run, p)


async def start_run(
    db: AsyncSession, p: Playbook, trigger: str, now: datetime, llm: LLM
) -> PlaybookRun:
    start, end = period(p, now)
    run = PlaybookRun(
        playbook_id=p.id,
        trigger=trigger,
        status=RunStatus.FAILED,
        period_start=start,
        period_end=end,
        tokens=0,
        cost=0.0,
        attempts=0,
    )
    db.add(run)
    await db.flush()
    created = await attempt(db, run, p, now, llm)
    await db.commit()
    await push(db, created)
    return run
