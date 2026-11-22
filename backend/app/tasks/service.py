"""Task responses with the activity of their task chat (messages and files), for the cards."""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import Message
from app.core import clock
from app.files.models import File
from app.tasks.models import Task
from app.tasks.schemas import TaskOut


async def _count_by_conversation(
    db: AsyncSession, column: object, conversation_ids: list[uuid.UUID], *where: object
) -> dict[uuid.UUID, int]:
    if not conversation_ids:
        return {}
    rows = await db.execute(
        select(column, func.count())  # type: ignore[call-overload]
        .where(column.in_(conversation_ids), *where)  # type: ignore[attr-defined]
        .group_by(column)
    )
    return {cid: n for cid, n in rows.all()}


async def task_outs(db: AsyncSession, tasks: Sequence[Task]) -> list[TaskOut]:
    """Two grouped queries for the whole list, never one per task."""
    ids = [t.conversation_id for t in tasks]
    messages = await _count_by_conversation(
        db, Message.conversation_id, ids, Message.deleted_at.is_(None)
    )
    files = await _count_by_conversation(db, File.conversation_id, ids)
    today = clock.now().date()
    return [
        TaskOut.of(t, today).model_copy(
            update={
                "message_count": messages.get(t.conversation_id, 0),
                "file_count": files.get(t.conversation_id, 0),
            }
        )
        for t in tasks
    ]


async def task_out(db: AsyncSession, task: Task) -> TaskOut:
    return (await task_outs(db, [task]))[0]
