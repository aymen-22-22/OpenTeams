import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.reminders.models import EmailFrequency, NotificationType, Recurrence, TargetType


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    title: str
    body: str
    link: str
    read_at: datetime | None
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread: int


class PreferenceItem(BaseModel):
    type: NotificationType
    in_app: bool
    email: bool
    email_frequency: EmailFrequency = EmailFrequency.INSTANT


class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    remind_at: datetime
    recurrence: Recurrence
    target_type: TargetType | None
    target_id: uuid.UUID | None
    active: bool


class ReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    remind_at: datetime
    recurrence: Recurrence = Recurrence.NONE
    target_type: TargetType | None = None
    target_id: uuid.UUID | None = None


class ReminderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    remind_at: datetime | None = None
    recurrence: Recurrence | None = None
    active: bool | None = None
