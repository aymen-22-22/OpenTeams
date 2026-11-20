import uuid
from typing import Annotated

from fastapi import APIRouter, Header, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth.deps import DB, CurrentUser
from app.chat.access import require_conversation, require_message
from app.chat.events import commit_and_publish
from app.chat.models import (
    Conversation,
    ConversationMember,
    ConversationType,
    Message,
    MessageRead,
    Pin,
)
from app.chat.schemas import (
    ConversationOut,
    DirectCreate,
    MessageCreate,
    MessageOut,
    MessagePage,
    MessageUpdate,
    PinOut,
    ReadIn,
)
from app.core import clock
from app.core.errors import AppError
from app.reminders.models import NotificationType
from app.reminders.notify import notify_members, push
from app.users.models import User

router = APIRouter(tags=["chat"])


async def _conversation_out(db: DB, conversation: Conversation, me: uuid.UUID) -> ConversationOut:
    member_ids = list(
        await db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conversation.id
            )
        )
    )
    last = await db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.seq.desc())
        .limit(1)
    )
    read_seq = (
        await db.scalar(
            select(MessageRead.last_read_seq).where(
                MessageRead.conversation_id == conversation.id, MessageRead.user_id == me
            )
        )
        or 0
    )
    unread = await db.scalar(
        select(func.count()).where(
            Message.conversation_id == conversation.id,
            Message.seq > read_seq,
            Message.author_id != me,
            Message.deleted_at.is_(None),
        )
    )
    return ConversationOut(
        id=conversation.id,
        type=conversation.type,
        title=conversation.title,
        member_ids=member_ids,
        last_message=MessageOut.of(last) if last else None,
        unread_count=unread or 0,
        last_read_seq=read_seq,
    )


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, db: DB) -> list[ConversationOut]:
    conversations = await db.scalars(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    )
    return [await _conversation_out(db, c, user.id) for c in conversations]


@router.post("/conversations/direct", response_model=ConversationOut)
async def open_direct(
    body: DirectCreate, user: CurrentUser, db: DB, response: Response
) -> ConversationOut:
    """Get or create the direct conversation between the current user and another user."""
    if body.user_id == user.id:
        raise AppError("invalid_target", "You cannot start a conversation with yourself")
    other = await db.get(User, body.user_id)
    if other is None or not other.is_active:
        raise AppError("not_found", "User not found", 404)

    key = ":".join(sorted([str(user.id), str(other.id)]))
    conversation = await db.scalar(select(Conversation).where(Conversation.direct_key == key))
    if conversation is None:
        conversation = Conversation(type=ConversationType.DIRECT, direct_key=key)
        db.add(conversation)
        await db.flush()
        db.add_all(
            [
                ConversationMember(conversation_id=conversation.id, user_id=user.id),
                ConversationMember(conversation_id=conversation.id, user_id=other.id),
            ]
        )
        await db.commit()
        response.status_code = 201
    return await _conversation_out(db, conversation, user.id)


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, db: DB
) -> ConversationOut:
    conversation = await require_conversation(db, conversation_id, user.id)
    return await _conversation_out(db, conversation, user.id)


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
async def list_messages(
    conversation_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
    before: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MessagePage:
    await require_conversation(db, conversation_id, user.id)
    query = select(Message).where(Message.conversation_id == conversation_id)
    if before is not None:
        query = query.where(Message.seq < before)
    rows = list(await db.scalars(query.order_by(Message.seq.desc()).limit(limit + 1)))
    has_more = len(rows) > limit
    rows = rows[:limit]
    return MessagePage(
        items=[MessageOut.of(m) for m in reversed(rows)],
        next_cursor=rows[-1].seq if has_more else None,
    )


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: uuid.UUID,
    body: MessageCreate,
    user: CurrentUser,
    db: DB,
    response: Response,
    idempotency_key: Annotated[str | None, Header(max_length=100)] = None,
) -> MessageOut:
    conversation = await require_conversation(db, conversation_id, user.id)

    if idempotency_key:
        existing = await db.scalar(
            select(Message).where(
                Message.author_id == user.id, Message.idempotency_key == idempotency_key
            )
        )
        if existing is not None:
            if existing.conversation_id != conversation_id:
                raise AppError("idempotency_conflict", "Idempotency key already used", 409)
            return MessageOut.of(existing)  # replay: same result, nothing new

    if body.reply_to_id is not None:
        parent = await db.get(Message, body.reply_to_id)
        if parent is None or parent.conversation_id != conversation_id:
            raise AppError("invalid_reply", "Reply target is not in this conversation", 422)

    message = Message(
        conversation_id=conversation_id,
        author_id=user.id,
        body=body.body,
        reply_to_id=body.reply_to_id,
        idempotency_key=idempotency_key,
    )
    db.add(message)
    conversation.updated_at = clock.now()
    try:
        await db.flush()
    except IntegrityError as exc:  # same key sent twice at the same moment
        raise AppError("idempotency_conflict", "Duplicate message", 409) from exc
    await db.refresh(message)
    out = MessageOut.of(message)
    created = await notify_members(
        db, conversation_id, user.id, NotificationType.MESSAGE, user.display_name, body.body[:200]
    )
    await commit_and_publish(db, conversation_id, "message.created", out.model_dump(mode="json"))
    await push(db, created)
    response.status_code = 201
    return out


async def _own_live_message(db: DB, message_id: uuid.UUID, user: User) -> Message:
    message = await require_message(db, message_id, user.id)
    if message.author_id != user.id:
        raise AppError("forbidden", "You can only change your own messages", 403)
    if message.deleted_at is not None:
        raise AppError("message_deleted", "This message was deleted", 409)
    return message


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    message_id: uuid.UUID, body: MessageUpdate, user: CurrentUser, db: DB
) -> MessageOut:
    message = await _own_live_message(db, message_id, user)
    message.body = body.body
    message.edited_at = clock.now()
    await db.flush()
    out = MessageOut.of(message)
    await commit_and_publish(
        db, message.conversation_id, "message.updated", out.model_dump(mode="json")
    )
    return out


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(message_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    message = await _own_live_message(db, message_id, user)
    message.deleted_at = clock.now()
    message.body = ""  # do not keep deleted content
    await commit_and_publish(
        db, message.conversation_id, "message.deleted", {"id": str(message.id)}
    )


@router.post("/conversations/{conversation_id}/read", status_code=204)
async def mark_read(conversation_id: uuid.UUID, body: ReadIn, user: CurrentUser, db: DB) -> None:
    await require_conversation(db, conversation_id, user.id)
    read = await db.scalar(
        select(MessageRead).where(
            MessageRead.conversation_id == conversation_id, MessageRead.user_id == user.id
        )
    )
    if read is None:
        read = MessageRead(conversation_id=conversation_id, user_id=user.id, last_read_seq=0)
        db.add(read)
    if body.seq <= read.last_read_seq:
        await db.commit()
        return
    read.last_read_seq = body.seq
    await commit_and_publish(
        db, conversation_id, "conversation.read", {"user_id": str(user.id), "seq": body.seq}
    )


@router.get("/conversations/{conversation_id}/pins", response_model=list[PinOut])
async def list_pins(conversation_id: uuid.UUID, user: CurrentUser, db: DB) -> list[PinOut]:
    await require_conversation(db, conversation_id, user.id)
    rows = await db.execute(
        select(Pin, Message)
        .join(Message, Message.id == Pin.message_id)
        .where(Pin.conversation_id == conversation_id, Message.deleted_at.is_(None))
        .order_by(Pin.created_at.desc())
    )
    return [
        PinOut(message=MessageOut.of(m), pinned_by=p.pinned_by, pinned_at=p.created_at)
        for p, m in rows
    ]


@router.post("/messages/{message_id}/pin", status_code=204)
async def pin_message(message_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    message = await require_message(db, message_id, user.id)
    if message.deleted_at is not None:
        raise AppError("message_deleted", "This message was deleted", 409)
    exists = await db.scalar(select(Pin.id).where(Pin.message_id == message_id))
    if exists:
        return
    db.add(Pin(conversation_id=message.conversation_id, message_id=message_id, pinned_by=user.id))
    await commit_and_publish(
        db, message.conversation_id, "pin.added", {"message_id": str(message_id)}
    )


@router.delete("/messages/{message_id}/pin", status_code=204)
async def unpin_message(message_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    message = await require_message(db, message_id, user.id)
    pin = await db.scalar(select(Pin).where(Pin.message_id == message_id))
    if pin is None:
        raise AppError("not_found", "Message is not pinned", 404)
    await db.delete(pin)
    await commit_and_publish(
        db, message.conversation_id, "pin.removed", {"message_id": str(message_id)}
    )
