"""Reading the bridge mailbox over IMAP (standard library, run in a thread)."""

import asyncio
import imaplib
import re
from typing import Protocol

from app.core.settings import get_settings

FETCH_LIMIT = 50  # emails per poll


class Mailbox(Protocol):
    async def fetch_unseen(self, max_bytes: int) -> list[tuple[str, bytes | None]]:
        """(uid, raw email) for unread emails; raw is None when the email is too large."""
        ...

    async def mark_seen(self, uids: list[str]) -> None: ...


class ImapMailbox:
    def _connect(self) -> imaplib.IMAP4_SSL:
        s = get_settings()
        conn = imaplib.IMAP4_SSL(s.bridge_imap_host, s.bridge_imap_port, timeout=30)
        conn.login(s.bridge_imap_user, s.bridge_imap_password)
        conn.select(s.bridge_imap_folder)
        return conn

    def _fetch(self, max_bytes: int) -> list[tuple[str, bytes | None]]:
        conn = self._connect()
        try:
            _, data = conn.uid("SEARCH", "UNSEEN")
            uids = (data[0] or b"").decode().split()[:FETCH_LIMIT]
            result: list[tuple[str, bytes | None]] = []
            for uid in uids:
                _, size_data = conn.uid("FETCH", uid, "(RFC822.SIZE)")
                match = re.search(rb"RFC822\.SIZE (\d+)", size_data[0] or b"")
                if match is None or int(match.group(1)) > max_bytes:
                    result.append((uid, None))
                    continue
                # BODY.PEEK keeps the email unread until we mark it, after processing.
                _, msg_data = conn.uid("FETCH", uid, "(BODY.PEEK[])")
                raw = msg_data[0][1] if msg_data and isinstance(msg_data[0], tuple) else None
                result.append((uid, raw if isinstance(raw, bytes) else None))
            return result
        finally:
            conn.logout()

    def _mark(self, uids: list[str]) -> None:
        if not uids:
            return
        conn = self._connect()
        try:
            conn.uid("STORE", ",".join(uids), "+FLAGS", "(\\Seen)")
        finally:
            conn.logout()

    async def fetch_unseen(self, max_bytes: int) -> list[tuple[str, bytes | None]]:
        return await asyncio.to_thread(self._fetch, max_bytes)

    async def mark_seen(self, uids: list[str]) -> None:
        await asyncio.to_thread(self._mark, uids)


def get_mailbox() -> Mailbox:
    """Replaced by a fake in tests."""
    return ImapMailbox()
