import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.files.schemas import FileOut
from app.projects.models import ProjectStatus
from app.tasks.schemas import TaskCounts, TaskOut


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=5000)
    status: ProjectStatus = ProjectStatus.ACTIVE
    start_date: date | None = None
    due_date: date | None = None
    member_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)


class MilestoneIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    date: date
    done: bool = False


class MilestoneOut(MilestoneIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    status: ProjectStatus
    owner_id: uuid.UUID | None
    start_date: date | None
    due_date: date | None
    finished_at: datetime | None
    member_ids: list[uuid.UUID]
    counts: TaskCounts
    can_edit: bool


class ProjectDetail(ProjectOut):
    milestones: list[MilestoneOut]
    tasks: list[TaskOut]
    files: list[FileOut]
