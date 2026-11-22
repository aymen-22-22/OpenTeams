import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app.admin import audit
from app.auth.deps import DB, CurrentUser
from app.bridge.service import address_for, new_token
from app.chat.access import require_conversation
from app.core.errors import AppError
from app.core.settings import get_settings

router = APIRouter(tags=["email bridge"])


class EmailAddress(BaseModel):
    address: str | None  # None until a member creates one


def _require_enabled() -> None:
    if not get_settings().bridge_enabled:
        raise AppError("bridge_disabled", "The email bridge is not configured", 404)


@router.get("/conversations/{conversation_id}/email-address", response_model=EmailAddress)
async def get_email_address(conversation_id: uuid.UUID, user: CurrentUser, db: DB) -> EmailAddress:
    """The address that posts into this conversation (members only)."""
    _require_enabled()
    conversation = await require_conversation(db, conversation_id, user.id)
    token = conversation.email_token
    return EmailAddress(address=address_for(token) if token else None)


@router.post("/conversations/{conversation_id}/email-address", response_model=EmailAddress)
async def new_email_address(conversation_id: uuid.UUID, user: CurrentUser, db: DB) -> EmailAddress:
    """Create the address, or replace it (e.g. if it leaked): the old one stops working at once."""
    _require_enabled()
    conversation = await require_conversation(db, conversation_id, user.id)
    action = "replaced" if conversation.email_token else "created"
    conversation.email_token = new_token()
    audit.record(db, user.id, f"email_bridge.address_{action}", "conversation", conversation.id)
    await db.commit()
    return EmailAddress(address=address_for(conversation.email_token))
