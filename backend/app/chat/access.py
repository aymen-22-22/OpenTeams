"""Membership checks. Non-members get 404 so they cannot learn a conversation exists."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import Conversation, ConversationMember, Message
from app.core.errors import AppError


async def is_member(db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    found = await db.scalar(
        select(ConversationMember.id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    return found is not None


async def require_conversation(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> Conversation:
    conversation = await db.get(Conversation, conversation_id)
    if conversation is None or not await is_member(db, conversation_id, user_id):
        raise AppError("not_found", "Conversation not found", 404)
    return conversation


async def require_message(db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID) -> Message:
    message = await db.get(Message, message_id)
    if message is None or not await is_member(db, message.conversation_id, user_id):
        raise AppError("not_found", "Message not found", 404)
    return message
