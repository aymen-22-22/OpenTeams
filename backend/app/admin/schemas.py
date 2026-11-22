import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.users.models import Role
from app.users.schemas import Locale


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=12, max_length=256)
    role: Role = Role.EMPLOYEE
    locale: Locale = "fr"


class UserAdminUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    new_password: str | None = Field(default=None, min_length=12, max_length=256)  # reset


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TeamMemberAdd(BaseModel):
    user_id: uuid.UUID


class TeamUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class AdminUserOut(BaseModel):
    """A user as the administration page sees it (deactivated ones included)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    role: Role
    locale: str
    is_active: bool
    created_at: datetime
