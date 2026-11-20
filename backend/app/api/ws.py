"""Single WebSocket endpoint. Authenticated by the session cookie; every event is typed."""

from typing import Annotated, Literal

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError

from app.auth.service import user_from_token
from app.core.db import SessionLocal
from app.core.realtime import hub
from app.core.security import SESSION_COOKIE
from app.core.settings import get_settings
from app.users import presence

router = APIRouter()


class PresenceSet(BaseModel):
    type: Literal["presence.set"]
    status: Literal["online", "away"]


class ClientEvent(BaseModel):
    event: Annotated[PresenceSet, Field(discriminator="type")]


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    origin = ws.headers.get("origin")
    if origin is not None and origin not in get_settings().allowed_origins:
        await ws.close(code=4403)
        return

    async with SessionLocal() as db:
        user = await user_from_token(db, ws.cookies.get(SESSION_COOKIE))
    if user is None:
        await ws.close(code=4401)
        return

    await ws.accept()
    hub.add(user.id, ws)
    await presence.set_status(user.id, "online")
    try:
        while True:
            try:
                event = ClientEvent.model_validate({"event": await ws.receive_json()}).event
            except (ValidationError, ValueError):
                await ws.send_json({"type": "error", "code": "invalid_event"})
                continue
            await presence.set_status(user.id, event.status)
    except WebSocketDisconnect:
        pass
    finally:
        if hub.remove(user.id, ws):
            await presence.set_status(user.id, "offline")
