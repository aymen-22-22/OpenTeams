import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.ai.models import Audience, Length, Provider


class ProfileOut(BaseModel):
    """Never contains the API key, only whether one is set."""

    model_config = ConfigDict(from_attributes=True)

    active: bool
    provider: Provider
    model: str
    has_api_key: bool
    system_prompt: str
    default_prompt: str
    language: str
    tone: str
    length: Length
    hours_start: int | None
    hours_end: int | None
    audience: Audience
    allowed_user_ids: list[uuid.UUID]
    allowed_team_ids: list[uuid.UUID]
    share_tasks: bool
    ready: bool


class ProfileUpdate(BaseModel):
    active: bool = False
    provider: Provider = Provider.ANTHROPIC
    model: str = Field(default="", max_length=100)
    api_key: str | None = Field(default=None, max_length=500)  # None keeps the current key
    clear_api_key: bool = False
    system_prompt: str = Field(default="", max_length=4000)
    default_prompt: str = Field(default="", max_length=1000)
    language: str = Field(default="fr", pattern="^(fr|en|ar)$")
    tone: str = Field(default="professional", max_length=40)
    length: Length = Length.MEDIUM
    hours_start: int | None = Field(default=None, ge=0, le=23)
    hours_end: int | None = Field(default=None, ge=0, le=23)
    audience: Audience = Audience.OWNER_ONLY
    allowed_user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)
    allowed_team_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    share_tasks: bool = False

    @model_validator(mode="after")
    def _hours_together(self) -> "ProfileUpdate":
        if (self.hours_start is None) != (self.hours_end is None):
            raise ValueError("hours_start and hours_end must be set together")
        return self


class AIMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    provider: str | None
    model: str | None
    created_at: datetime


class AskIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ThreadOut(BaseModel):
    owner_id: uuid.UUID
    available: bool  # the AI is active and within its hours
    messages: list[AIMessageOut]


class LogThread(BaseModel):
    caller_id: uuid.UUID
    messages: list[AIMessageOut]
