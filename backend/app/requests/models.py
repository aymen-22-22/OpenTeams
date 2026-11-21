import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _enum(cls: type[enum.StrEnum]) -> Enum:
    return Enum(
        cls,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda e: [m.value for m in e],
    )


class RequestKind(enum.StrEnum):
    LEAVE = "leave"
    EQUIPMENT = "equipment"
    EXPENSE = "expense"
    OTHER = "other"


class RequestStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class Request(Base):
    """A request waiting for (or having received) a decision from one approver."""

    __tablename__ = "requests"

    requester_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    approver_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[RequestKind] = mapped_column(_enum(RequestKind))
    title: Mapped[str] = mapped_column(String(200))
    comment: Mapped[str] = mapped_column(Text, default="")
    # Kind-specific fields: leave {start_date, end_date, leave_type}, expense {amount, currency}.
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[RequestStatus] = mapped_column(
        _enum(RequestStatus), default=RequestStatus.PENDING
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_comment: Mapped[str] = mapped_column(Text, default="")


class RequestStep(Base):
    """History of a request: submitted, approved, rejected, cancelled."""

    __tablename__ = "request_steps"

    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(20))
    comment: Mapped[str] = mapped_column(Text, default="")
