"""Scheduled playbook jobs (take `now`, like every job)."""

from datetime import datetime

from sqlalchemy import select

from app.ai import provider
from app.core.db import SessionLocal
from app.playbooks.models import Playbook, PlaybookRun, RunStatus
from app.playbooks.runner import attempt, start_run
from app.playbooks.schedule import next_run
from app.reminders.notify import push


async def run_due_playbooks(now: datetime) -> int:
    async with SessionLocal() as db:
        due = list(
            await db.scalars(
                select(Playbook).where(Playbook.enabled.is_(True), Playbook.next_run_at <= now)
            )
        )
        for p in due:
            p.next_run_at = next_run(p, now)  # move on first: a crash never loops on one run
            await db.commit()
            await start_run(db, p, "schedule", now, provider.get_llm())
        return len(due)


async def retry_failed_runs(now: datetime) -> int:
    async with SessionLocal() as db:
        runs = list(
            await db.scalars(
                select(PlaybookRun).where(
                    PlaybookRun.status == RunStatus.FAILED, PlaybookRun.next_retry_at <= now
                )
            )
        )
        for run in runs:
            p = await db.get(Playbook, run.playbook_id)
            if p is None:
                continue
            created = await attempt(db, run, p, now, provider.get_llm())
            await db.commit()
            await push(db, created)
        return len(runs)
