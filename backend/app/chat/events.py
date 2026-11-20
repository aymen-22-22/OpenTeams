"""Stored real-time events, so a client can resume after a reconnect (`last_event_id`)."""

import uuid
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Identity, String, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.chat.models import ConversationMember
from app.core.db import Base
from app.core.realtime import hub

REPLAY_LIMIT = 500


class RealtimeEvent(Base):
    __tablename__ = "realtime_events"

    seq: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(60))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)

    def to_wire(self) -> dict[str, Any]:
        return {
            "id": self.seq,
            "type": self.type,
            "conversation_id": str(self.conversation_id),
            "data": self.data,
        }


async def commit_and_publish(
    db: AsyncSession, conversation_id: uuid.UUID, type_: str, data: dict[str, Any]
) -> None:
    """Store the event with the current transaction, commit, then push it to online members."""
    event = RealtimeEvent(conversation_id=conversation_id, type=type_, data=data)
    db.add(event)
    await db.commit()
    user_ids = await db.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id
        )
    )
    wire = event.to_wire()
    for user_id in user_ids:
        await hub.send_to_user(user_id, wire)


async def missed_events(db: AsyncSession, user_id: uuid.UUID, after: int) -> list[dict[str, Any]]:
    rows = await db.scalars(
        select(RealtimeEvent)
        .where(
            RealtimeEvent.seq > after,
            RealtimeEvent.conversation_id.in_(
                select(ConversationMember.conversation_id).where(
                    ConversationMember.user_id == user_id
                )
            ),
        )
        .order_by(RealtimeEvent.seq)
        .limit(REPLAY_LIMIT)
    )
    return [e.to_wire() for e in rows]
