import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select, update

from app.auth.deps import DB, CurrentUser
from app.core import clock
from app.core.errors import AppError
from app.reminders.models import Notification, NotificationPreference, NotificationType, Reminder
from app.reminders.notify import channels
from app.reminders.schemas import (
    NotificationList,
    NotificationOut,
    PreferenceItem,
    ReminderCreate,
    ReminderOut,
    ReminderUpdate,
)
from app.reminders.targets import target_link

router = APIRouter(tags=["reminders"])


# --- notifications ---------------------------------------------------------------------


@router.get("/notifications", response_model=NotificationList)
async def list_notifications(
    user: CurrentUser, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 30
) -> NotificationList:
    items = await db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    unread = await db.scalar(
        select(func.count()).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return NotificationList(
        items=[NotificationOut.model_validate(n) for n in items], unread=unread or 0
    )


@router.post("/notifications/{notification_id}/read", status_code=204)
async def mark_notification_read(notification_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    n = await db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise AppError("not_found", "Notification not found", 404)
    n.read_at = n.read_at or clock.now()
    await db.commit()


@router.post("/notifications/read-all", status_code=204)
async def mark_all_read(user: CurrentUser, db: DB) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=clock.now())
    )
    await db.commit()


@router.get("/notifications/preferences", response_model=list[PreferenceItem])
async def get_preferences(user: CurrentUser, db: DB) -> list[PreferenceItem]:
    result = []
    for type_ in NotificationType:
        in_app, email = await channels(db, user.id, type_)
        result.append(PreferenceItem(type=type_, in_app=in_app, email=email))
    return result


@router.put("/notifications/preferences", response_model=list[PreferenceItem])
async def set_preferences(
    body: list[PreferenceItem], user: CurrentUser, db: DB
) -> list[PreferenceItem]:
    for item in body:
        pref = await db.scalar(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user.id, NotificationPreference.type == item.type
            )
        )
        if pref is None:
            pref = NotificationPreference(user_id=user.id, type=item.type)
            db.add(pref)
        pref.in_app, pref.email = item.in_app, item.email
    await db.commit()
    return await get_preferences(user, db)


# --- reminders -------------------------------------------------------------------------


async def _own_reminder(db: DB, reminder_id: uuid.UUID, user_id: uuid.UUID) -> Reminder:
    r = await db.get(Reminder, reminder_id)
    if r is None or r.user_id != user_id:
        raise AppError("not_found", "Reminder not found", 404)
    return r


@router.get("/reminders", response_model=list[ReminderOut])
async def list_reminders(user: CurrentUser, db: DB) -> list[Reminder]:
    return list(
        await db.scalars(
            select(Reminder)
            .where(Reminder.user_id == user.id, Reminder.active.is_(True))
            .order_by(Reminder.remind_at)
            .limit(200)
        )
    )


@router.post("/reminders", response_model=ReminderOut, status_code=201)
async def create_reminder(body: ReminderCreate, user: CurrentUser, db: DB) -> Reminder:
    if body.remind_at.tzinfo is None:
        raise AppError("invalid_time", "remind_at must include a timezone", 422)
    await target_link(db, user, body.target_type, body.target_id)  # visibility check
    reminder = Reminder(user_id=user.id, **body.model_dump())
    db.add(reminder)
    await db.commit()
    return reminder


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut)
async def update_reminder(
    reminder_id: uuid.UUID, body: ReminderUpdate, user: CurrentUser, db: DB
) -> Reminder:
    reminder = await _own_reminder(db, reminder_id, user.id)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(reminder, field, value)
    await db.commit()
    return reminder


@router.delete("/reminders/{reminder_id}", status_code=204)
async def delete_reminder(reminder_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _own_reminder(db, reminder_id, user.id))
    await db.commit()
