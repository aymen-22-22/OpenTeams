"""Single WebSocket endpoint. Authenticated by the session cookie; every event is typed.

Connect with `/ws?last_event_id=N` to receive the stored events missed since N.
"""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select

from app.auth.service import user_from_token
from app.chat.access import is_member
from app.chat.events import missed_events
from app.chat.models import ConversationMember
from app.core.db import SessionLocal
from app.core.realtime import hub
from app.core.security import SESSION_COOKIE
from app.core.settings import get_settings
from app.users import presence

router = APIRouter()


class PresenceSet(BaseModel):
    type: Literal["presence.set"]
    status: Literal["online", "away"]


class Typing(BaseModel):
    type: Literal["typing"]
    conversation_id: uuid.UUID


class ClientEvent(BaseModel):
    event: Annotated[PresenceSet | Typing, Field(discriminator="type")]


async def _send_typing(user_id: uuid.UUID, event: Typing) -> bool:
    async with SessionLocal() as db:
        if not await is_member(db, event.conversation_id, user_id):
            return False
        others = await db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == event.conversation_id,
                ConversationMember.user_id != user_id,
            )
        )
        wire = {
            "type": "typing",
            "conversation_id": str(event.conversation_id),
            "data": {"user_id": str(user_id)},
        }
        for other in others:
            await hub.send_to_user(other, wire)
    return True


@router.websocket("/ws")
async def websocket(
    ws: WebSocket, last_event_id: Annotated[int | None, Query(ge=0)] = None
) -> None:
    origin = ws.headers.get("origin")
    if origin is not None and origin not in get_settings().allowed_origins:
        await ws.close(code=4403)
        return

    async with SessionLocal() as db:
        user = await user_from_token(db, ws.cookies.get(SESSION_COOKIE))
        missed = await missed_events(db, user.id, last_event_id) if user and last_event_id else []
    if user is None:
        await ws.close(code=4401)
        return

    await ws.accept()
    for missed_event in missed:
        await ws.send_json(missed_event)
    hub.add(user.id, ws)
    await presence.set_status(user.id, "online")
    try:
        while True:
            try:
                event = ClientEvent.model_validate({"event": await ws.receive_json()}).event
            except (ValidationError, ValueError):
                await ws.send_json({"type": "error", "code": "invalid_event"})
                continue
            if isinstance(event, PresenceSet):
                await presence.set_status(user.id, event.status)
            elif not await _send_typing(user.id, event):
                await ws.send_json({"type": "error", "code": "forbidden"})
    except WebSocketDisconnect:
        pass
    finally:
        if hub.remove(user.id, ws):
            await presence.set_status(user.id, "offline")
