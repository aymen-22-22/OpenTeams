"""Group channels: public ones can be browsed and joined, private ones are invitation-only."""

import uuid

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import audit
from app.auth.deps import DB, CurrentUser
from app.chat.models import Conversation, ConversationMember, ConversationType
from app.core.errors import AppError
from app.users.models import Role, User

router = APIRouter(prefix="/channels", tags=["channels"])


class ChannelIn(BaseModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^#@\s][^#@]*$")
    description: str = Field(default="", max_length=500)
    is_private: bool = False
    member_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)


class ChannelOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    is_private: bool
    created_by: uuid.UUID | None
    member_count: int
    joined: bool
    can_manage: bool


async def _members(db: AsyncSession, channel_id: uuid.UUID) -> set[uuid.UUID]:
    return set(
        await db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == channel_id
            )
        )
    )


def _can_manage(c: Conversation, user: User) -> bool:
    return c.created_by == user.id or user.role == Role.ADMIN


async def _out(db: AsyncSession, c: Conversation, user: User) -> ChannelOut:
    members = await _members(db, c.id)
    return ChannelOut(
        id=c.id,
        name=c.title or "",
        description=c.description,
        is_private=c.is_private,
        created_by=c.created_by,
        member_count=len(members),
        joined=user.id in members,
        can_manage=_can_manage(c, user),
    )


async def _get(db: AsyncSession, channel_id: uuid.UUID, user: User) -> Conversation:
    """A public channel, or a private one the user belongs to. Otherwise 404."""
    c = await db.get(Conversation, channel_id)
    if c is None or c.type != ConversationType.CHANNEL:
        raise AppError("not_found", "Channel not found", 404)
    if c.is_private and user.id not in await _members(db, c.id) and user.role != Role.ADMIN:
        raise AppError("not_found", "Channel not found", 404)
    return c


async def _check_name(db: AsyncSession, name: str, except_id: uuid.UUID | None = None) -> None:
    query = select(Conversation.id).where(
        Conversation.type == ConversationType.CHANNEL,
        func.lower(Conversation.title) == name.lower(),
    )
    if except_id:
        query = query.where(Conversation.id != except_id)
    if await db.scalar(query):
        raise AppError("channel_exists", "A channel with this name already exists", 409)


async def _check_users(db: AsyncSession, ids: set[uuid.UUID]) -> None:
    for uid in ids:
        u = await db.get(User, uid)
        if u is None or not u.is_active:
            raise AppError("invalid_member", "Unknown member", 422)


@router.get("", response_model=list[ChannelOut])
async def list_channels(user: CurrentUser, db: DB) -> list[ChannelOut]:
    """Every public channel, plus the private ones I am a member of."""
    mine = select(ConversationMember.conversation_id).where(ConversationMember.user_id == user.id)
    rows = await db.scalars(
        select(Conversation)
        .where(Conversation.type == ConversationType.CHANNEL)
        .where(Conversation.is_private.is_(False) | Conversation.id.in_(mine))
        .order_by(func.lower(Conversation.title))
    )
    return [await _out(db, c, user) for c in rows]


@router.post("", response_model=ChannelOut, status_code=201)
async def create_channel(body: ChannelIn, user: CurrentUser, db: DB) -> ChannelOut:
    name = body.name.strip()
    await _check_name(db, name)
    ids = set(body.member_ids) | {user.id}
    await _check_users(db, ids)
    c = Conversation(
        type=ConversationType.CHANNEL,
        title=name,
        description=body.description,
        is_private=body.is_private,
        created_by=user.id,
    )
    db.add(c)
    await db.flush()
    db.add_all([ConversationMember(conversation_id=c.id, user_id=uid) for uid in ids])
    audit.record(db, user.id, "channel.created", "conversation", c.id, private=body.is_private)
    await db.commit()
    return await _out(db, c, user)


@router.get("/{channel_id}", response_model=ChannelOut)
async def get_channel(channel_id: uuid.UUID, user: CurrentUser, db: DB) -> ChannelOut:
    return await _out(db, await _get(db, channel_id, user), user)


@router.put("/{channel_id}", response_model=ChannelOut)
async def update_channel(
    channel_id: uuid.UUID, body: ChannelIn, user: CurrentUser, db: DB
) -> ChannelOut:
    c = await _get(db, channel_id, user)
    if not _can_manage(c, user):
        raise AppError("forbidden", "Only the channel creator or an admin can change it", 403)
    name = body.name.strip()
    await _check_name(db, name, except_id=c.id)
    c.title, c.description, c.is_private = name, body.description, body.is_private
    ids = set(body.member_ids) | ({c.created_by} if c.created_by else set())
    await _check_users(db, ids)
    current = await _members(db, c.id)
    if current - ids:
        await db.execute(
            delete(ConversationMember).where(
                ConversationMember.conversation_id == c.id,
                ConversationMember.user_id.in_(current - ids),
            )
        )
    db.add_all([ConversationMember(conversation_id=c.id, user_id=uid) for uid in ids - current])
    audit.record(db, user.id, "channel.updated", "conversation", c.id)
    await db.commit()
    return await _out(db, c, user)


@router.post("/{channel_id}/join", response_model=ChannelOut)
async def join_channel(channel_id: uuid.UUID, user: CurrentUser, db: DB) -> ChannelOut:
    c = await _get(db, channel_id, user)
    if c.is_private:
        raise AppError("private_channel", "Private channels are invitation-only", 403)
    if user.id not in await _members(db, c.id):
        db.add(ConversationMember(conversation_id=c.id, user_id=user.id))
        await db.commit()
    return await _out(db, c, user)


@router.post("/{channel_id}/leave", response_model=ChannelOut)
async def leave_channel(channel_id: uuid.UUID, user: CurrentUser, db: DB) -> ChannelOut:
    c = await _get(db, channel_id, user)
    await db.execute(
        delete(ConversationMember).where(
            ConversationMember.conversation_id == c.id, ConversationMember.user_id == user.id
        )
    )
    await db.commit()
    return await _out(db, c, user)
