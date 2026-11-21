import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _enum(cls: type[enum.StrEnum]) -> Enum:
    return Enum(
        cls,
        native_enum=False,
        create_constraint=True,
        length=30,
        values_callable=lambda e: [m.value for m in e],
    )


class PlaybookKind(enum.StrEnum):
    TASK_SUMMARY = "task_summary"
    WEEKLY_REPORT = "weekly_report"
    MONTHLY_REPORT = "monthly_report"
    MONDAY_SUMMARY = "monday_summary"


class Frequency(enum.StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class RunStatus(enum.StrEnum):
    AWAITING_APPROVAL = "awaiting_approval"
    DELIVERED = "delivered"
    REJECTED = "rejected"
    FAILED = "failed"  # will be retried while attempts remain


class Playbook(Base):
    """A routine that builds a report from the owner's visible data and delivers it."""

    __tablename__ = "playbooks"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[PlaybookKind] = mapped_column(_enum(PlaybookKind))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Schedule, in the app timezone: every day / week (weekday 0=Monday) / month (day) at `hour`.
    frequency: Mapped[Frequency] = mapped_column(_enum(Frequency))
    weekday: Mapped[int] = mapped_column(Integer, default=0)
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)
    hour: Mapped[int] = mapped_column(Integer, default=8)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    # Data scope (whose tasks; empty = everyone the owner can see) and delivery.
    scope_user_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    recipient_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    deliver_in_app: Mapped[bool] = mapped_column(Boolean, default=True)
    deliver_email: Mapped[bool] = mapped_column(Boolean, default=False)
    approval_required: Mapped[bool] = mapped_column(Boolean, default=False)
    use_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    instructions: Mapped[str] = mapped_column(Text, default="")


class PlaybookRun(Base):
    __tablename__ = "playbook_runs"

    playbook_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("playbooks.id", ondelete="CASCADE"), index=True
    )
    trigger: Mapped[str] = mapped_column(String(20))  # schedule | manual
    status: Mapped[RunStatus] = mapped_column(_enum(RunStatus))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    inputs: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)  # counts, scope
    # One report per recipient (Monday summary differs per person): {user_id: text}
    outputs: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict)
    recipient_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(String(200))
