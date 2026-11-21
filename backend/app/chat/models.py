import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    DateTime,
    Enum,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ConversationType(enum.StrEnum):
    DIRECT = "direct"
    TASK = "task"
    CHANNEL = "channel"


class Conversation(Base):
    __tablename__ = "conversations"

    type: Mapped[ConversationType] = mapped_column(
        Enum(
            ConversationType,
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda e: [m.value for m in e],
        )
    )
    title: Mapped[str | None] = mapped_column(String(200))
    # For direct conversations: the two user ids sorted and joined, so each pair has one chat.
    direct_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    # Channels only
    description: Mapped[str] = mapped_column(Text, default="")
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id"),)

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("author_id", "idempotency_key"),
        Index("ix_messages_conversation_seq", "conversation_id", "seq"),
        Index("ix_messages_search", "search", postgresql_using="gin"),
    )

    seq: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text)
    reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL")
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "simple" config: no language-specific stemming, works the same for fr, en and ar.
    search: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', body)", persisted=True), deferred=True
    )


class MessageRead(Base):
    """Read pointer: the member has read every message up to `last_read_seq`."""

    __tablename__ = "message_reads"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id"),)

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    last_read_seq: Mapped[int] = mapped_column(BigInteger, default=0)


class Pin(Base):
    __tablename__ = "pins"
    __table_args__ = (UniqueConstraint("conversation_id", "message_id"),)

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"))
    pinned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
