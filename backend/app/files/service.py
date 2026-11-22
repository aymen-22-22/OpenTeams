"""Storing a file in a conversation: shared by uploads and the email bridge."""

import secrets
import uuid
from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import audit
from app.core import clock
from app.core.errors import AppError
from app.core.settings import get_settings
from app.core.storage import get_storage
from app.files import rules
from app.files.models import File, FileVersion
from app.files.scan import scan


class _TooLarge(Exception):
    pass


async def _limited(
    chunks: AsyncIterator[bytes], max_bytes: int, counter: list[int]
) -> AsyncIterator[bytes]:
    """Pass the data through, counting bytes and stopping at the limit."""
    async for chunk in chunks:
        counter[0] += len(chunk)
        if counter[0] > max_bytes:
            raise _TooLarge
        yield chunk


def max_bytes() -> int:
    return get_settings().max_upload_mb * 1024 * 1024


async def store_file(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    raw_name: str,
    chunks: AsyncIterator[bytes],
) -> File:
    """Check name, type, size and scan, then save a new file or a new version of one.

    The caller has already checked membership, and commits. Raises AppError when rejected.
    """
    name = rules.safe_name(raw_name)
    if name is None:
        raise AppError("invalid_name", "Invalid file name", 422)
    kind = rules.kind_of(name)
    if kind is None:
        raise AppError("type_not_allowed", "This file type is not allowed", 415)

    storage = get_storage()
    key = secrets.token_hex(16)
    size = [0]
    try:
        await storage.save(key, _limited(chunks, max_bytes(), size))
    except _TooLarge as exc:
        await storage.delete(key)
        raise AppError("too_large", "File is too large", 413) from exc
    if size[0] == 0 or not await scan(key):
        await storage.delete(key)
        raise AppError("rejected", "Empty or unsafe file", 422)

    file = await db.scalar(
        select(File).where(File.conversation_id == conversation_id, File.name == name)
    )
    if file is None:
        file = File(conversation_id=conversation_id, name=name, kind=kind, size=size[0])
        db.add(file)
        await db.flush()
    else:
        file.current_version += 1
        file.size = size[0]
        file.updated_at = clock.now()
    db.add(
        FileVersion(
            file_id=file.id,
            version=file.current_version,
            storage_key=key,
            size=size[0],
            uploaded_by=user_id,
        )
    )
    audit.record(db, user_id, "file.uploaded", "file", file.id, version=file.current_version)
    await db.flush()
    await db.refresh(file)
    return file
