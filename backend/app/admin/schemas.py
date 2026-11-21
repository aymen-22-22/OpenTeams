import uuid

from pydantic import BaseModel, EmailStr, Field

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
