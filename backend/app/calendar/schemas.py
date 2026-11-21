import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.calendar.models import EventType


class EventOut(BaseModel):
    """A calendar entry. Task events have `task_id` and no `id` of their own."""

    id: str  # "<uuid>" for stored events, "task-due:<task id>" / "task-finished:<task id>"
    type: EventType
    title: str
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    user_ids: list[uuid.UUID]  # assignee or attendees
    task_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    creator_id: uuid.UUID | None = None
    description: str = ""
    conversation_id: uuid.UUID | None = None


class MeetingIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    starts_at: datetime
    ends_at: datetime
    all_day: bool = False
    attendee_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)
    conversation_id: uuid.UUID | None = None  # from a chat: its members are invited

    @model_validator(mode="after")
    def _valid_range(self) -> "MeetingIn":
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("times must include a timezone")
        if self.ends_at < self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class FeedUrl(BaseModel):
    url: str
