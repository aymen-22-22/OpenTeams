import enum
import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Role(enum.StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    EMPLOYEE = "employee"


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    locale: Mapped[str] = mapped_column(String(5), default="fr")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(
        Enum(
            Role,
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=Role.EMPLOYEE,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # SHA-256 of the private iCal feed token (the token itself is never stored).
    ical_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    # Daily digest email: local hour (app TIMEZONE) and the last day it was sent.
    digest_hour: Mapped[int] = mapped_column(Integer, default=8)
    digest_last_sent_on: Mapped[date | None] = mapped_column(Date)


class Team(Base):
    __tablename__ = "teams"

    name: Mapped[str] = mapped_column(String(120), unique=True)


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id"),)

    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
