"""APScheduler setup. Runs inside the API process (one API instance)."""

import logging
from collections.abc import Awaitable, Callable
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core import clock
from app.core.settings import get_settings

logger = logging.getLogger(__name__)

Job = Callable[[datetime], Awaitable[int]]


def _run(job: Job) -> Callable[[], Awaitable[None]]:
    async def wrapper() -> None:
        try:
            await job(clock.now())
        except Exception:
            logger.exception("Scheduled job %s failed", job.__name__)

    return wrapper


def create_scheduler() -> AsyncIOScheduler:
    from app.bridge.service import poll_mailbox
    from app.playbooks import jobs as playbook_jobs  # local imports: jobs depend on most modules
    from app.reminders import jobs

    scheduler = AsyncIOScheduler(timezone=get_settings().timezone)
    scheduler.add_job(_run(jobs.process_due_reminders), "interval", seconds=30, id="reminders")
    scheduler.add_job(_run(jobs.send_outbox), "interval", seconds=20, id="outbox")
    scheduler.add_job(_run(jobs.nudge_overdue_tasks), "cron", hour=8, minute=30, id="overdue")
    scheduler.add_job(_run(jobs.send_digests), "interval", minutes=10, id="digests")
    scheduler.add_job(_run(jobs.cleanup_realtime_events), "cron", hour=3, id="cleanup")
    scheduler.add_job(_run(playbook_jobs.run_due_playbooks), "interval", minutes=1, id="playbooks")
    scheduler.add_job(_run(playbook_jobs.retry_failed_runs), "interval", minutes=1, id="retries")
    settings = get_settings()
    if settings.bridge_enabled:
        scheduler.add_job(
            _run(poll_mailbox), "interval", seconds=settings.bridge_poll_seconds, id="email_bridge"
        )
    return scheduler
