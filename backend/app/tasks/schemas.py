import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.tasks.models import Priority, Task, TaskStatus


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    status: TaskStatus
    priority: Priority
    position: float
    due_date: date | None
    overdue: bool
    finished_at: datetime | None
    creator_id: uuid.UUID | None
    assignee_id: uuid.UUID | None
    conversation_id: uuid.UUID
    source_message_id: uuid.UUID | None
    project_id: uuid.UUID | None
    created_at: datetime

    @classmethod
    def of(cls, task: Task, today: date) -> "TaskOut":
        overdue = (
            task.due_date is not None
            and task.due_date < today
            and task.status != TaskStatus.FINISHED
        )
        return cls(
            id=task.id,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            position=task.position,
            due_date=task.due_date,
            overdue=overdue,
            finished_at=task.finished_at,
            creator_id=task.creator_id,
            assignee_id=task.assignee_id,
            conversation_id=task.conversation_id,
            source_message_id=task.source_message_id,
            project_id=task.project_id,
            created_at=task.created_at,
        )


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10_000)
    assignee_id: uuid.UUID | None = None  # defaults to the creator
    due_date: date | None = None
    priority: Priority = Priority.NORMAL
    source_message_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10_000)
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    priority: Priority | None = None
    project_id: uuid.UUID | None = None


class TaskMove(BaseModel):
    status: TaskStatus
    after_id: uuid.UUID | None = None  # place right after this task; None = top of the column


class TaskCounts(BaseModel):
    pending: int = 0
    in_progress: int = 0
    finished: int = 0
