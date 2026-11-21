"""Prometheus metrics. Served only inside the Docker network: Caddy does not proxy /metrics."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from prometheus_client import CONTENT_TYPE_LATEST, Gauge, generate_latest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.realtime import hub
from app.playbooks.models import PlaybookRun, RunStatus
from app.reminders.models import EmailOutbox, EmailStatus

router = APIRouter(include_in_schema=False)

WS_USERS = Gauge("openteams_websocket_users", "Users with at least one open WebSocket")
OUTBOX_PENDING = Gauge("openteams_email_outbox_pending", "Emails waiting to be sent")
OUTBOX_FAILED = Gauge("openteams_email_outbox_failed", "Emails that failed after all retries")
PLAYBOOK_FAILED = Gauge("openteams_playbook_runs_failed", "Playbook runs in failed state")


@router.get("/metrics")
async def metrics(db: Annotated[AsyncSession, Depends(get_session)]) -> Response:
    WS_USERS.set(hub.user_count())
    counts = dict(
        (
            await db.execute(select(EmailOutbox.status, func.count()).group_by(EmailOutbox.status))
        ).all()
    )
    OUTBOX_PENDING.set(counts.get(EmailStatus.PENDING, 0))
    OUTBOX_FAILED.set(counts.get(EmailStatus.FAILED, 0))
    PLAYBOOK_FAILED.set(
        await db.scalar(select(func.count()).where(PlaybookRun.status == RunStatus.FAILED)) or 0
    )
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
