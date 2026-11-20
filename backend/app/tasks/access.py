"""Who can see a task: members of its task chat, plus managers and admins (manager view)."""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import ConversationMember
from app.core.errors import AppError
from app.tasks.models import Task
from app.users.models import Role, User


def sees_all(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.MANAGER)


def visible_tasks(user: User) -> Select[Task]:
    query = select(Task)
    if sees_all(user):
        return query
    return query.where(
        Task.conversation_id.in_(
            select(ConversationMember.conversation_id).where(ConversationMember.user_id == user.id)
        )
    )


async def require_task(db: AsyncSession, task_id: uuid.UUID, user: User) -> Task:
    task = await db.scalar(visible_tasks(user).where(Task.id == task_id))
    if task is None:
        raise AppError("not_found", "Task not found", 404)
    return task
