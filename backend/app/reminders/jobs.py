"""Scheduled jobs. Each takes `now` so tests can drive them with a controllable clock."""

import calendar
import logging
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select

from app.admin.org import email_brand, smtp_config
from app.chat.events import RealtimeEvent
from app.core.db import SessionLocal
from app.core.settings import get_settings
from app.reminders import email
from app.reminders.models import (
    DigestItem,
    EmailOutbox,
    EmailStatus,
    Notification,
    NotificationType,
    Recurrence,
    Reminder,
)
from app.reminders.notify import notify, push
from app.reminders.targets import target_link
from app.tasks.models import Task, TaskStatus
from app.users.models import User

logger = logging.getLogger(__name__)

MAX_EMAIL_ATTEMPTS = 5
EVENT_RETENTION_DAYS = 7


def next_occurrence(at: datetime, recurrence: Recurrence) -> datetime:
    match recurrence:
        case Recurrence.DAILY:
            return at + timedelta(days=1)
        case Recurrence.WEEKLY:
            return at + timedelta(weeks=1)
        case _:  # monthly: same day next month, clamped (31 Jan -> 28/29 Feb)
            year, month = (at.year + 1, 1) if at.month == 12 else (at.year, at.month + 1)
            day = min(at.day, calendar.monthrange(year, month)[1])
            return at.replace(year=year, month=month, day=day)


async def process_due_reminders(now: datetime) -> int:
    async with SessionLocal() as db:
        due = list(
            await db.scalars(
                select(Reminder)
                .where(Reminder.active.is_(True), Reminder.remind_at <= now)
                .limit(200)
            )
        )
        created = []
        for r in due:
            user = await db.get(User, r.user_id)
            try:
                link = await target_link(db, user, r.target_type, r.target_id) if user else "/"
            except Exception:  # target deleted or no longer visible: still remind, without link
                link = "/"
            created.append(
                await notify(db, r.user_id, NotificationType.REMINDER, r.title, link=link)
            )
            if r.recurrence == Recurrence.NONE:
                r.active = False
            else:
                while r.remind_at <= now:  # skip occurrences missed while offline
                    r.remind_at = next_occurrence(r.remind_at, r.recurrence)
        await db.commit()
        await push(db, created)
        return len(due)


async def send_outbox(now: datetime) -> int:
    """Send pending emails; on failure retry with exponential backoff, then give up."""
    sent = 0
    async with SessionLocal() as db:
        config = await smtp_config(db)  # the Administration page settings, or .env
        pending = list(
            await db.scalars(
                select(EmailOutbox)
                .where(
                    EmailOutbox.status == EmailStatus.PENDING, EmailOutbox.next_attempt_at <= now
                )
                .order_by(EmailOutbox.next_attempt_at)
                .limit(50)
            )
        )
        for mail in pending:
            mail.attempts += 1
            try:
                await email.send_email(mail.to_email, mail.subject, mail.html, mail.text, config)
                mail.status = EmailStatus.SENT
                sent += 1
            except Exception as exc:
                mail.last_error = type(exc).__name__  # no addresses or content in logs
                if mail.attempts >= MAX_EMAIL_ATTEMPTS:
                    mail.status = EmailStatus.FAILED
                    logger.warning("Email gave up after %s attempts", mail.attempts)
                else:
                    mail.next_attempt_at = now + timedelta(minutes=2**mail.attempts)
            await db.commit()
    return sent


async def send_digests(now: datetime) -> int:
    """Send each user one daily digest, at their hour, of what they did not already read.

    Items created after today's digest time wait for tomorrow's. Returns emails queued.
    """
    tz = ZoneInfo(get_settings().timezone)
    local_now = now.astimezone(tz)
    today = local_now.date()
    queued = 0
    async with SessionLocal() as db:
        user_ids = list(await db.scalars(select(DigestItem.user_id).distinct()))
        brand = await email_brand(db)
        for user_id in user_ids:
            user = await db.get(User, user_id)
            if user is None:
                continue
            cutoff = datetime.combine(today, time(user.digest_hour), tz)
            if local_now < cutoff or user.digest_last_sent_on == today:
                continue
            rows = (
                await db.execute(
                    select(DigestItem, Notification.read_at)
                    .outerjoin(Notification, Notification.id == DigestItem.notification_id)
                    .where(DigestItem.user_id == user_id, DigestItem.created_at < cutoff)
                    .order_by(DigestItem.created_at)
                )
            ).all()
            unread = [item for item, read_at in rows if read_at is None]
            if user.is_active and unread:
                entries = [email.DigestEntry(i.type.value, i.title, i.body, i.link) for i in unread]
                rendered = email.render_digest(entries, user.locale, brand)
                db.add(
                    EmailOutbox(
                        to_email=user.email,
                        subject=rendered.subject,
                        html=rendered.html,
                        text=rendered.text,
                        next_attempt_at=now,
                    )
                )
                queued += 1
            await db.execute(delete(DigestItem).where(DigestItem.id.in_([i.id for i, _ in rows])))
            user.digest_last_sent_on = today
            await db.commit()
    return queued


async def nudge_overdue_tasks(now: datetime) -> int:
    """Once a day, remind each assignee of their overdue tasks."""
    today = now.astimezone(ZoneInfo(get_settings().timezone)).date()
    async with SessionLocal() as db:
        tasks = list(
            await db.scalars(
                select(Task)
                .where(
                    Task.status != TaskStatus.FINISHED,
                    Task.due_date < today,
                    Task.assignee_id.is_not(None),
                    (Task.nudged_on.is_(None)) | (Task.nudged_on < today),
                )
                .limit(500)
            )
        )
        created = []
        for task in tasks:
            assert task.assignee_id is not None
            created.append(
                await notify(
                    db,
                    task.assignee_id,
                    NotificationType.TASK,
                    task.title,
                    body=f"⏰ {task.due_date}",
                    link=f"/tasks/{task.id}",
                )
            )
            task.nudged_on = today
        await db.commit()
        await push(db, created)
        return len(tasks)


async def cleanup_realtime_events(now: datetime) -> int:
    async with SessionLocal() as db:
        result = await db.execute(
            delete(RealtimeEvent).where(
                RealtimeEvent.created_at < now - timedelta(days=EVENT_RETENTION_DAYS)
            )
        )
        await db.commit()
        return int(getattr(result, "rowcount", 0) or 0)
