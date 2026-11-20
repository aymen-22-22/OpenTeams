"""In-process WebSocket hub. Add Redis pub/sub here only when running several API instances."""

import uuid
from typing import Any

from fastapi import WebSocket


class ConnectionHub:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, set[WebSocket]] = {}

    def add(self, user_id: uuid.UUID, ws: WebSocket) -> bool:
        """Register a socket. Returns True if this is the user's first connection."""
        sockets = self._connections.setdefault(user_id, set())
        sockets.add(ws)
        return len(sockets) == 1

    def remove(self, user_id: uuid.UUID, ws: WebSocket) -> bool:
        """Unregister a socket. Returns True if the user has no connection left."""
        sockets = self._connections.get(user_id, set())
        sockets.discard(ws)
        if not sockets:
            self._connections.pop(user_id, None)
            return True
        return False

    async def send_to_user(self, user_id: uuid.UUID, event: dict[str, Any]) -> None:
        for ws in list(self._connections.get(user_id, ())):
            await ws.send_json(event)

    async def broadcast(self, event: dict[str, Any]) -> None:
        for user_id in list(self._connections):
            await self.send_to_user(user_id, event)


hub = ConnectionHub()
