"""What a reminder can point to, and the visibility check for it."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.access import is_member, require_message
from app.core.errors import AppError
from app.files.models import File
from app.reminders.models import TargetType
from app.tasks.access import require_task
from app.users.models import User


async def target_link(
    db: AsyncSession, user: User, target_type: TargetType | None, target_id: uuid.UUID | None
) -> str:
    """App path for the target. Raises 404 if the user cannot see it."""
    if target_type is None:
        return "/"
    if target_id is None:
        raise AppError("invalid_target", "target_id is required with target_type", 422)
    match target_type:
        case TargetType.MESSAGE:
            message = await require_message(db, target_id, user.id)
            return f"/conversations/{message.conversation_id}"
        case TargetType.FILE:
            file = await db.get(File, target_id)
            if file is None or not await is_member(db, file.conversation_id, user.id):
                raise AppError("not_found", "File not found", 404)
            return f"/conversations/{file.conversation_id}"
        case TargetType.TASK:
            task = await require_task(db, target_id, user)
            return f"/tasks/{task.id}"
        case TargetType.EVENT:
            raise AppError("not_supported", "Calendar events arrive in a later phase", 422)
