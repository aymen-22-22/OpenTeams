"""One entry point for notifications: respects preferences, stores, pushes live, queues email."""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import ConversationMember
from app.core import clock
from app.core.realtime import hub
from app.reminders.email import render_notification
from app.reminders.models import (
    DigestItem,
    EmailFrequency,
    EmailOutbox,
    Notification,
    NotificationPreference,
    NotificationType,
)
from app.reminders.schemas import NotificationOut
from app.users.models import User

# Defaults when the user never changed a preference: everything in-app, email only when it matters.
DEFAULT_EMAIL = {
    NotificationType.REMINDER,
    NotificationType.TASK,
    NotificationType.APPROVAL,
    NotificationType.REPORT,
    NotificationType.EVENT,
    NotificationType.MENTION,
}


@dataclass(frozen=True)
class Channels:
    in_app: bool
    email: bool
    frequency: EmailFrequency = EmailFrequency.INSTANT


async def channels(db: AsyncSession, user_id: uuid.UUID, type_: NotificationType) -> Channels:
    pref = await db.scalar(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id, NotificationPreference.type == type_
        )
    )
    if pref is None:
        return Channels(in_app=True, email=type_ in DEFAULT_EMAIL)
    return Channels(pref.in_app, pref.email, pref.email_frequency)


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID,
    type_: NotificationType,
    title: str,
    body: str = "",
    link: str = "/",
    allow_in_app: bool = True,
    allow_email: bool = True,
) -> Notification | None:
    """Create the notification in the current transaction. Call `push` after commit.

    `allow_*` let the sender narrow the channels; the user's preferences always apply too.
    Email goes out at once (outbox) or waits for the daily digest, as the user chose.
    """
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    ch = await channels(db, user_id, type_)
    title = title[:200]
    notification = None
    if ch.in_app and allow_in_app:
        notification = Notification(user_id=user_id, type=type_, title=title, body=body, link=link)
        db.add(notification)
    if ch.email and allow_email:
        if ch.frequency == EmailFrequency.DAILY:
            db.add(
                DigestItem(
                    user_id=user_id,
                    type=type_,
                    title=title,
                    body=body,
                    link=link,
                    notification=notification,
                    created_at=clock.now(),  # the digest cutoff follows the app clock
                )
            )
        else:
            rendered = render_notification(type_.value, title, body, link, user.locale)
            db.add(
                EmailOutbox(
                    to_email=user.email,
                    subject=rendered.subject,
                    html=rendered.html,
                    text=rendered.text,
                    next_attempt_at=clock.now(),
                )
            )
    return notification


async def push(db: AsyncSession, notifications: list[Notification | None]) -> None:
    """Send stored notifications to connected browsers (after the transaction committed)."""
    for n in notifications:
        if n is None:
            continue
        await db.refresh(n)
        out = NotificationOut.model_validate(n).model_dump(mode="json")
        await hub.send_to_user(n.user_id, {"type": "notification.created", "data": out})


async def notify_members(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    except_user: uuid.UUID,
    type_: NotificationType,
    title: str,
    body: str = "",
) -> list[Notification | None]:
    """Notify every member of a conversation except the author."""
    member_ids = await db.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id != except_user,
        )
    )
    link = f"/conversations/{conversation_id}"
    return [await notify(db, uid, type_, title, body, link) for uid in list(member_ids)]
