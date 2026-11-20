"""Presence: online/away/offline, tracked in memory and broadcast over the WebSocket hub."""

import uuid

from app.core.realtime import hub
from app.users.schemas import Presence

_status: dict[uuid.UUID, Presence] = {}


def get(user_id: uuid.UUID) -> Presence:
    return _status.get(user_id, "offline")


async def set_status(user_id: uuid.UUID, status: Presence) -> None:
    if get(user_id) == status:
        return
    if status == "offline":
        _status.pop(user_id, None)
    else:
        _status[user_id] = status
    await hub.broadcast({"type": "presence.changed", "user_id": str(user_id), "status": status})


def reset() -> None:
    _status.clear()
