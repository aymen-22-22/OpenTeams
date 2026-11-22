"""Email bridge: emails sent to a conversation's address become messages in it.

Rules: the address must match a conversation, the sender must be an active user who is a
member of it, and (by default) our mail server must have marked the email dmarc=pass.
Everything else is rejected and recorded, and no reply is ever sent (no backscatter).
"""

import logging
import re
import secrets
from collections.abc import AsyncIterator
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import audit
from app.bridge.mailbox import get_mailbox
from app.bridge.models import InboundEmail, InboundStatus
from app.bridge.parse import ParsedEmail, parse_email
from app.chat.access import is_member
from app.chat.events import commit_and_publish
from app.chat.models import Conversation, Message
from app.chat.router import notify_for_message
from app.chat.schemas import MAX_BODY, MessageOut
from app.core import clock
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.core.settings import get_settings
from app.files.models import File
from app.files.schemas import FileOut
from app.files.service import max_bytes, store_file
from app.reminders.notify import push
from app.users.models import User

logger = logging.getLogger(__name__)

# No look-alike characters, all lower case: survives servers that lower-case addresses.
_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"
TOKEN_LENGTH = 16  # about 80 bits


class Rejected(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason


def new_token() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(TOKEN_LENGTH))


def address_for(token: str) -> str:
    local, domain = get_settings().bridge_address.split("@", 1)
    return f"{local}+c-{token}@{domain}"


def find_token(recipients: list[str]) -> str | None:
    local, _, domain = get_settings().bridge_address.lower().partition("@")
    pattern = re.compile(rf"^{re.escape(local)}\+c-([a-z0-9]{{8,32}})@{re.escape(domain)}$")
    for address in recipients:
        if match := pattern.match(address):
            return match.group(1)
    return None


async def _route(
    db: AsyncSession, email: ParsedEmail, record: InboundEmail
) -> tuple[User, Conversation]:
    token = find_token(email.recipients)
    if token is None:
        raise Rejected("no_address")
    conversation = await db.scalar(select(Conversation).where(Conversation.email_token == token))
    if conversation is None:
        raise Rejected("unknown_address")
    record.conversation_id = conversation.id
    sender = await db.scalar(
        select(User).where(func.lower(User.email) == email.sender, User.is_active.is_(True))
    )
    if sender is None:
        raise Rejected("unknown_sender")
    record.sender_id = sender.id
    if get_settings().bridge_require_dmarc and not email.dmarc_pass:
        raise Rejected("not_authenticated")
    if not await is_member(db, conversation.id, sender.id):
        raise Rejected("not_member")
    return sender, conversation


async def _once(data: bytes) -> AsyncIterator[bytes]:
    yield data


async def _post(
    db: AsyncSession,
    email: ParsedEmail,
    record: InboundEmail,
    sender: User,
    conversation: Conversation,
) -> None:
    files: list[File] = []
    for attachment in email.attachments:
        try:
            files.append(
                await store_file(
                    db, conversation.id, sender.id, attachment.name, _once(attachment.data)
                )
            )
        except AppError:  # type not allowed, too large, unsafe: the rest still goes through
            record.skipped_attachments += 1
    record.attachments = len(files)

    parts = [p for p in (email.subject, email.text) if p]
    if files:
        parts.append("📎 " + ", ".join(f.name for f in files))
    if not parts:
        raise Rejected("empty")
    body = "\n\n".join(parts)[:MAX_BODY]

    message = Message(
        conversation_id=conversation.id, author_id=sender.id, body=body, via_email=True
    )
    db.add(message)
    conversation.updated_at = clock.now()
    await db.flush()
    await db.refresh(message)
    record.status, record.message_id = InboundStatus.POSTED, message.id
    db.add(record)
    audit.record(db, sender.id, "email_bridge.posted", "message", message.id, files=len(files))
    created = await notify_for_message(db, conversation, sender, body)
    out = MessageOut.of(message)
    await commit_and_publish(db, conversation.id, "message.created", out.model_dump(mode="json"))
    for file in files:
        data = FileOut.model_validate(file).model_dump(mode="json")
        await commit_and_publish(db, conversation.id, "file.created", data)
    await push(db, created)


async def process_email(db: AsyncSession, raw: bytes) -> InboundEmail | None:
    """Post one email, or record why it was rejected. None if it was already processed."""
    email = parse_email(raw)
    existing = await db.scalar(select(InboundEmail).where(InboundEmail.message_key == email.key))
    if existing is not None:
        return None
    record = InboundEmail(message_key=email.key, attachments=0, skipped_attachments=0)
    try:
        sender, conversation = await _route(db, email, record)
        await _post(db, email, record, sender, conversation)
    except Rejected as exc:
        await db.rollback()  # nothing half-done stays
        rejected = InboundEmail(
            message_key=email.key,
            status=InboundStatus.REJECTED,
            reason=exc.reason,
            sender_id=record.sender_id,
            conversation_id=record.conversation_id,
            attachments=0,
            skipped_attachments=0,
        )
        db.add(rejected)
        audit.record(
            db,
            record.sender_id,
            "email_bridge.rejected",
            "conversation",
            record.conversation_id,
            reason=exc.reason,
        )
        await db.commit()
        logger.info("Email bridge rejected an email: %s", exc.reason)
        return rejected
    return record


def raw_size_limit() -> int:
    """Attachments grow by a third in base64; leave room for that and the text."""
    return max_bytes() * 4 // 3 + 1024 * 1024


async def poll_mailbox(now: datetime) -> int:
    """Scheduled job: process unread emails, then mark them read. Returns messages posted."""
    if not get_settings().bridge_enabled:
        return 0
    mailbox = get_mailbox()
    emails = await mailbox.fetch_unseen(raw_size_limit())
    done, posted = [], 0
    for uid, raw in emails:
        if raw is None:
            logger.warning("Email bridge skipped an email over the size limit")
        else:
            async with SessionLocal() as db:
                try:
                    record = await process_email(db, raw)
                    posted += record is not None and record.status == InboundStatus.POSTED
                except Exception as exc:  # never loop on a broken email; no content in logs
                    logger.error("Email bridge could not process an email: %s", type(exc).__name__)
        done.append(uid)
    await mailbox.mark_seen(done)
    return posted
