import secrets
import uuid
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Annotated, Literal
from urllib.parse import quote, unquote

import jwt
from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.admin import audit
from app.auth.deps import DB, CurrentUser
from app.chat.access import require_conversation
from app.chat.events import commit_and_publish
from app.core import clock
from app.core.errors import AppError
from app.core.settings import get_settings
from app.core.storage import get_storage
from app.files import rules
from app.files.models import File, FileVersion
from app.files.scan import scan
from app.files.schemas import DownloadUrl, FileOut

router = APIRouter(tags=["files"])

Kind = Literal["pdf", "spreadsheet", "document", "image", "other"]


class _TooLarge(Exception):
    pass


async def _limited(request: Request, max_bytes: int, counter: list[int]) -> AsyncIterator[bytes]:
    """Pass the request body through, counting bytes and stopping at the limit."""
    async for chunk in request.stream():
        counter[0] += len(chunk)
        if counter[0] > max_bytes:
            raise _TooLarge
        yield chunk


@router.post("/conversations/{conversation_id}/files", response_model=FileOut, status_code=201)
async def upload_file(
    conversation_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: DB,
    x_file_name: Annotated[str, Header(max_length=1024)],
    content_length: Annotated[int | None, Header()] = None,
) -> FileOut:
    """Upload the raw request body as a file. The name is sent URL-encoded in X-File-Name."""
    await require_conversation(db, conversation_id, user.id)
    name = rules.safe_name(unquote(x_file_name))
    if name is None:
        raise AppError("invalid_name", "Invalid file name", 422)
    kind = rules.kind_of(name)
    if kind is None:
        raise AppError("type_not_allowed", "This file type is not allowed", 415)
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    if content_length is not None and content_length > max_bytes:
        raise AppError("too_large", "File is too large", 413)

    storage = get_storage()
    key = secrets.token_hex(16)
    size = [0]
    try:
        await storage.save(key, _limited(request, max_bytes, size))
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
            uploaded_by=user.id,
        )
    )
    audit.record(db, user.id, "file.uploaded", "file", file.id, version=file.current_version)
    await db.flush()
    await db.refresh(file)
    out = FileOut.model_validate(file)
    await commit_and_publish(db, conversation_id, "file.created", out.model_dump(mode="json"))
    return out


@router.get("/conversations/{conversation_id}/files", response_model=list[FileOut])
async def list_files(
    conversation_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
    kind: Kind | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[File]:
    await require_conversation(db, conversation_id, user.id)
    query = select(File).where(File.conversation_id == conversation_id)
    if kind:
        query = query.where(File.kind == kind)
    return list(await db.scalars(query.order_by(File.updated_at.desc()).limit(limit)))


@router.get("/files/{file_id}/download-url", response_model=DownloadUrl)
async def download_url(
    file_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> DownloadUrl:
    """Short-lived signed link. Membership is checked here, when the link is created."""
    file = await db.get(File, file_id)
    if file is None:
        raise AppError("not_found", "File not found", 404)
    await require_conversation(db, file.conversation_id, user.id)
    v = await db.scalar(
        select(FileVersion).where(
            FileVersion.file_id == file_id, FileVersion.version == (version or file.current_version)
        )
    )
    if v is None:
        raise AppError("not_found", "Version not found", 404)

    settings = get_settings()
    token = jwt.encode(
        {
            "vid": str(v.id),
            "uid": str(user.id),
            "exp": clock.now() + timedelta(seconds=settings.download_url_seconds),
        },
        settings.secret_key,
        algorithm="HS256",
    )
    audit.record(db, user.id, "file.download_link", "file", file.id, version=v.version)
    await db.commit()
    return DownloadUrl(
        url=f"/api/v1/files/download?token={token}", expires_in=settings.download_url_seconds
    )


@router.get("/files/download")
async def download(token: str, db: DB) -> StreamingResponse:
    try:
        claims = jwt.decode(
            token, get_settings().secret_key, algorithms=["HS256"], options={"verify_exp": False}
        )
        if claims["exp"] <= clock.now().timestamp():
            raise AppError("link_expired", "Download link expired", 410)
        version = await db.get(FileVersion, uuid.UUID(claims["vid"]))
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise AppError("invalid_link", "Invalid download link", 403) from exc
    file = await db.get(File, version.file_id) if version else None
    if version is None or file is None:
        raise AppError("not_found", "File not found", 404)

    headers = {
        # Always a download, never rendered inline: uploaded content cannot run in our origin.
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file.name)}",
        "Content-Length": str(version.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }
    return StreamingResponse(
        get_storage().open(version.storage_key),
        media_type="application/octet-stream",
        headers=headers,
    )
