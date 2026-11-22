import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import DB, CurrentUser
from app.chat.access import require_message
from app.chat.events import commit_and_publish
from app.chat.models import Conversation, ConversationMember, ConversationType
from app.core import clock
from app.core.errors import AppError
from app.projects.access import require_project
from app.reminders.models import NotificationType
from app.reminders.notify import notify, push
from app.tasks.access import require_task, visible_tasks
from app.tasks.models import Task, TaskEvent, TaskStatus
from app.tasks.schemas import TaskCounts, TaskCreate, TaskMove, TaskOut, TaskUpdate
from app.tasks.service import task_out, task_outs
from app.users.models import Role, User

router = APIRouter(prefix="/tasks", tags=["tasks"])

STEP = 1024.0  # gap between positions when appending


async def _active_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError("invalid_assignee", "Assignee not found", 422)
    return user


async def _add_member(db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID) -> None:
    exists = await db.scalar(
        select(ConversationMember.id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    if not exists:
        db.add(ConversationMember(conversation_id=conversation_id, user_id=user_id))


async def _publish(
    db: AsyncSession, task: Task, actor: User, type_: str, assigned: bool = False, **data: Any
) -> TaskOut:
    """Record history, publish to the task chat, and tell a new assignee (not themselves)."""
    db.add(TaskEvent(task_id=task.id, actor_id=actor.id, type=type_, data=data))
    created = []
    if assigned and task.assignee_id and task.assignee_id != actor.id:
        created.append(
            await notify(
                db,
                task.assignee_id,
                NotificationType.TASK,
                task.title,
                body=actor.display_name,
                link=f"/tasks/{task.id}",
            )
        )
    await db.flush()
    await db.refresh(task)
    out = await task_out(db, task)
    await commit_and_publish(db, task.conversation_id, f"task.{type_}", out.model_dump(mode="json"))
    await push(db, created)
    return out


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    user: CurrentUser,
    db: DB,
    assignee_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
) -> list[TaskOut]:
    """Tasks visible to me, optionally only those assigned to one person (their board)."""
    query = visible_tasks(user)
    if assignee_id is not None:
        query = query.where(Task.assignee_id == assignee_id)
    tasks = await db.scalars(query.order_by(Task.status, Task.position).limit(limit))
    return await task_outs(db, list(tasks))


@router.get("/counts", response_model=TaskCounts)
async def task_counts(
    user: CurrentUser, db: DB, assignee_id: uuid.UUID | None = None
) -> TaskCounts:
    visible = visible_tasks(user)
    if assignee_id is not None:
        visible = visible.where(Task.assignee_id == assignee_id)
    sub = visible.subquery()
    rows = await db.execute(select(sub.c.status, func.count()).group_by(sub.c.status))
    return TaskCounts(**{str(status): count for status, count in rows.all()})


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate, user: CurrentUser, db: DB) -> TaskOut:
    assignee = await _active_user(db, body.assignee_id) if body.assignee_id else user
    if body.source_message_id is not None:
        await require_message(db, body.source_message_id, user.id)  # must see the message
    if body.project_id is not None:
        await require_project(db, body.project_id, user)  # must see the project

    conversation = Conversation(type=ConversationType.TASK, title=body.title)
    db.add(conversation)
    await db.flush()
    for member_id in {user.id, assignee.id}:
        db.add(ConversationMember(conversation_id=conversation.id, user_id=member_id))

    top = await db.scalar(select(func.min(Task.position)).where(Task.status == body.status))
    task = Task(
        title=body.title,
        description=body.description,
        priority=body.priority,
        due_date=body.due_date,
        creator_id=user.id,
        assignee_id=assignee.id,
        conversation_id=conversation.id,
        source_message_id=body.source_message_id,
        project_id=body.project_id,
        status=body.status,
        finished_at=clock.now() if body.status == TaskStatus.FINISHED else None,
        position=(top - STEP) if top is not None else 0.0,  # new tasks go on top
    )
    db.add(task)
    await db.flush()
    return await _publish(db, task, user, "created", assigned=True)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: uuid.UUID, user: CurrentUser, db: DB) -> TaskOut:
    return await task_out(db, await require_task(db, task_id, user))


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: uuid.UUID, body: TaskUpdate, user: CurrentUser, db: DB) -> TaskOut:
    task = await require_task(db, task_id, user)
    changes = body.model_dump(exclude_unset=True)
    if "assignee_id" in changes:
        if changes["assignee_id"] is None:
            raise AppError("invalid_assignee", "A task must have an assignee", 422)
        await _active_user(db, changes["assignee_id"])
        await _add_member(db, task.conversation_id, changes["assignee_id"])
    if changes.get("project_id") is not None:
        await require_project(db, changes["project_id"], user)
    for field in ("title", "priority"):
        if field in changes and changes[field] is None:
            raise AppError("invalid_value", f"{field} cannot be empty", 422)
    for field, value in changes.items():
        setattr(task, field, value)
    if "title" in changes:
        conversation = await db.get(Conversation, task.conversation_id)
        if conversation:
            conversation.title = changes["title"]
    return await _publish(
        db, task, user, "updated", assigned="assignee_id" in changes, fields=sorted(changes)
    )


@router.post("/{task_id}/move", response_model=TaskOut)
async def move_task(task_id: uuid.UUID, body: TaskMove, user: CurrentUser, db: DB) -> TaskOut:
    task = await require_task(db, task_id, user)
    in_column = select(Task.position).where(Task.status == body.status, Task.id != task.id)

    if body.after_id is None:
        first = await db.scalar(in_column.order_by(Task.position).limit(1))
        position = (first - STEP) if first is not None else 0.0
    else:
        after = await db.get(Task, body.after_id)
        if after is None or after.status != body.status or after.id == task.id:
            raise AppError("invalid_position", "after_id must be another task in that column", 422)
        following = await db.scalar(
            in_column.where(Task.position > after.position).order_by(Task.position).limit(1)
        )
        position = (
            (after.position + following) / 2 if following is not None else after.position + STEP
        )

    old_status = task.status
    task.status = body.status
    task.position = position
    task.finished_at = clock.now() if body.status == TaskStatus.FINISHED else None
    return await _publish(
        db, task, user, "moved", from_status=old_status.value, to_status=body.status.value
    )


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    task = await require_task(db, task_id, user)
    if task.creator_id != user.id and user.role != Role.ADMIN:
        raise AppError("forbidden", "Only the creator or an admin can delete a task", 403)
    # Deleting the task chat removes the task too (ON DELETE CASCADE).
    await db.execute(delete(Conversation).where(Conversation.id == task.conversation_id))
    await db.commit()
