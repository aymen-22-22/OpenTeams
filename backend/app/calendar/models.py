import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EventType(enum.StrEnum):
    DAY_OFF = "day_off"
    MEETING = "meeting"
    MILESTONE = "milestone"
    PROJECT_FINISHED = "project_finished"
    TASK_DUE = "task_due"  # computed from tasks, never stored
    TASK_FINISHED = "task_finished"  # computed from tasks, never stored


class CalendarEvent(Base):
    """Stored events (meetings now; leave and project events later)."""

    __tablename__ = "calendar_events"
    __table_args__ = (Index("ix_calendar_events_range", "starts_at", "ends_at"),)

    type: Mapped[EventType] = mapped_column(
        Enum(
            EventType,
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda e: [m.value for m in e],
        )
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL")
    )


class EventAttendee(Base):
    __tablename__ = "calendar_event_attendees"
    __table_args__ = (UniqueConstraint("event_id", "user_id"),)

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("calendar_events.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
