import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class InboundStatus(enum.StrEnum):
    POSTED = "posted"
    REJECTED = "rejected"


class InboundEmail(Base):
    """One processed email: makes processing idempotent and leaves a trace (no content kept)."""

    __tablename__ = "inbound_emails"

    # SHA-256 of the Message-ID header (or of the raw email when it has none).
    message_key: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[InboundStatus] = mapped_column(
        Enum(
            InboundStatus,
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda e: [m.value for m in e],
        )
    )
    reason: Mapped[str] = mapped_column(String(40), default="")
    sender_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL")
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL")
    )
    attachments: Mapped[int] = mapped_column(Integer, default=0)
    skipped_attachments: Mapped[int] = mapped_column(Integer, default=0)
