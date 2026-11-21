import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.playbooks.models import Frequency, PlaybookKind, RunStatus


class PlaybookIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: PlaybookKind
    enabled: bool = True
    frequency: Frequency = Frequency.WEEKLY
    weekday: int = Field(default=0, ge=0, le=6)
    day_of_month: int = Field(default=1, ge=1, le=31)
    hour: int = Field(default=8, ge=0, le=23)
    scope_user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    recipient_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    deliver_in_app: bool = True
    deliver_email: bool = False
    approval_required: bool = False
    use_ai: bool = False
    instructions: str = Field(default="", max_length=2000)


class PlaybookOut(PlaybookIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    next_run_at: datetime


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    playbook_id: uuid.UUID
    trigger: str
    status: RunStatus
    period_start: datetime
    period_end: datetime
    inputs: dict[str, object]
    recipient_ids: list[uuid.UUID]
    tokens: int
    cost: float
    duration_ms: int
    attempts: int
    error: str | None
    created_at: datetime


class ReportOut(BaseModel):
    """What one reader sees: their own report (the owner sees all of them)."""

    run: RunOut
    playbook_name: str
    is_owner: bool
    reports: dict[uuid.UUID, str]


class PreviewOut(BaseModel):
    reports: dict[uuid.UUID, str]
