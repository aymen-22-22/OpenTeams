import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.users.models import Role

Locale = Literal["fr", "en", "ar"]
Presence = Literal["online", "away", "offline"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    locale: str
    role: Role


class PersonOut(BaseModel):
    """A user as shown in the people panel."""

    id: uuid.UUID
    display_name: str
    role: Role
    presence: Presence
    ai_active: bool  # always False until the personal AI module exists (Phase 6)


class MeUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    locale: Locale | None = None


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    member_ids: list[uuid.UUID] = []
