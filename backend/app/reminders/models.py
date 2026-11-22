import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _enum(cls: type[enum.StrEnum]) -> Enum:
    return Enum(
        cls,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda e: [m.value for m in e],
    )


class NotificationType(enum.StrEnum):
    MESSAGE = "message"
    REMINDER = "reminder"
    FILE = "file"
    TASK = "task"
    APPROVAL = "approval"
    REPORT = "report"
    EVENT = "event"
    MENTION = "mention"


class EmailFrequency(enum.StrEnum):
    INSTANT = "instant"  # one email per notification
    DAILY = "daily"  # collected into one daily digest


class Recurrence(enum.StrEnum):
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class TargetType(enum.StrEnum):
    MESSAGE = "message"
    FILE = "file"
    TASK = "task"
    EVENT = "event"


class Reminder(Base):
    __tablename__ = "reminders"
    __table_args__ = (Index("ix_reminders_due", "active", "remind_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    remind_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recurrence: Mapped[Recurrence] = mapped_column(_enum(Recurrence), default=Recurrence.NONE)
    target_type: Mapped[TargetType | None] = mapped_column(_enum(TargetType))
    target_id: Mapped[uuid.UUID | None]
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(_enum(NotificationType))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(300), default="/")  # app path, e.g. /tasks/<id>
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("user_id", "type"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(_enum(NotificationType))
    in_app: Mapped[bool] = mapped_column(Boolean, default=True)
    email: Mapped[bool] = mapped_column(Boolean, default=False)
    email_frequency: Mapped[EmailFrequency] = mapped_column(
        _enum(EmailFrequency), default=EmailFrequency.INSTANT
    )
    push: Mapped[bool] = mapped_column(Boolean, default=False)


class PushSubscription(Base):
    """One browser or phone that accepted push notifications."""

    __tablename__ = "push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    endpoint: Mapped[str] = mapped_column(String(1000), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))  # browser's public key
    auth: Mapped[str] = mapped_column(String(100))  # browser's auth secret
    user_agent: Mapped[str] = mapped_column(String(200), default="")


class PushItem(Base):
    """A push waiting to be sent by the push job (requests never wait for push services)."""

    __tablename__ = "push_queue"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(300), default="/")
    force: Mapped[bool] = mapped_column(Boolean, default=False)  # test push: even if online


class DigestItem(Base):
    """A notification waiting for the user's daily digest email."""

    __tablename__ = "digest_items"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[NotificationType] = mapped_column(_enum(NotificationType))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(300), default="/")
    # The matching in-app notification, if any: once read there, it is left out of the digest.
    notification_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notifications.id", ondelete="SET NULL")
    )
    notification: Mapped["Notification | None"] = relationship()


class EmailStatus(enum.StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class EmailOutbox(Base):
    """Emails waiting to be sent by the scheduler. Requests never talk to SMTP."""

    __tablename__ = "email_outbox"
    __table_args__ = (Index("ix_email_outbox_due", "status", "next_attempt_at"),)

    to_email: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300))
    html: Mapped[str] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[EmailStatus] = mapped_column(_enum(EmailStatus), default=EmailStatus.PENDING)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(300))
