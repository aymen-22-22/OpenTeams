import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.chat.models import ConversationType, Message

MAX_BODY = 10_000


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    seq: int
    conversation_id: uuid.UUID
    author_id: uuid.UUID | None
    body: str
    reply_to_id: uuid.UUID | None
    created_at: datetime
    edited_at: datetime | None
    deleted: bool
    via_email: bool = False

    @classmethod
    def of(cls, m: Message) -> "MessageOut":
        return cls(
            id=m.id,
            seq=m.seq,
            conversation_id=m.conversation_id,
            author_id=m.author_id,
            body="" if m.deleted_at else m.body,
            reply_to_id=m.reply_to_id,
            created_at=m.created_at,
            edited_at=m.edited_at,
            deleted=m.deleted_at is not None,
            via_email=m.via_email,
        )


class MessagePage(BaseModel):
    items: list[MessageOut]  # oldest first
    next_cursor: int | None  # pass as `before` to load older messages


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY)
    reply_to_id: uuid.UUID | None = None


class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY)


class ConversationOut(BaseModel):
    id: uuid.UUID
    type: ConversationType
    title: str | None
    member_ids: list[uuid.UUID]
    last_message: MessageOut | None
    unread_count: int
    last_read_seq: int


class DirectCreate(BaseModel):
    user_id: uuid.UUID


class ReadIn(BaseModel):
    seq: int = Field(ge=0)


class PinOut(BaseModel):
    message: MessageOut
    pinned_by: uuid.UUID | None
    pinned_at: datetime
