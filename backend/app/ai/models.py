import enum
import uuid
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum,
    Float,
    ForeignKey,
    Identity,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
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


class Provider(enum.StrEnum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    QWEN = "qwen"
    OLLAMA = "ollama"


class Audience(enum.StrEnum):
    OWNER_ONLY = "owner_only"
    EVERYONE = "everyone"
    PEOPLE = "people"
    TEAMS = "teams"


class Length(enum.StrEnum):
    SHORT = "short"
    MEDIUM = "medium"
    LONG = "long"


class AIProfile(Base):
    """A user's personal AI. Defaults share nothing and let only the owner talk to it."""

    __tablename__ = "ai_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    provider: Mapped[Provider] = mapped_column(_enum(Provider), default=Provider.ANTHROPIC)
    model: Mapped[str] = mapped_column(String(100), default="")
    api_key_encrypted: Mapped[str | None] = mapped_column(Text)  # never returned to clients
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    default_prompt: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(5), default="fr")
    tone: Mapped[str] = mapped_column(String(40), default="professional")
    length: Mapped[Length] = mapped_column(_enum(Length), default=Length.MEDIUM)
    hours_start: Mapped[int | None] = mapped_column(Integer)  # local hour, inclusive
    hours_end: Mapped[int | None] = mapped_column(Integer)  # local hour, exclusive
    # Visibility rules
    audience: Mapped[Audience] = mapped_column(_enum(Audience), default=Audience.OWNER_ONLY)
    allowed_user_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    allowed_team_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    share_tasks: Mapped[bool] = mapped_column(Boolean, default=False)


class AIConversation(Base):
    """One thread between a caller and an owner's AI."""

    __tablename__ = "ai_conversations"
    __table_args__ = (UniqueConstraint("owner_id", "caller_id"),)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    caller_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))


class AIMessage(Base):
    __tablename__ = "ai_messages"

    seq: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)  # display order
    ai_conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(10))  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(20))
    model: Mapped[str | None] = mapped_column(String(100))


class AIAuditLog(Base):
    """Every provider call: who asked whose AI, with which model, cost and outcome."""

    __tablename__ = "ai_audit_log"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    caller_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20))  # ok | error
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
