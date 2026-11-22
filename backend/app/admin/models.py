import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    """Who did what. Never store secrets or message content in `details`."""

    __tablename__ = "audit_log"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[uuid.UUID | None]
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class OrgSettings(Base):
    """Organization-wide settings edited in the Administration page (a single row).

    Empty SMTP host means "use the SMTP_* environment variables". The SMTP password is
    stored encrypted (Fernet) and never returned by the API.
    """

    __tablename__ = "org_settings"

    smtp_host: Mapped[str] = mapped_column(String(255), default="")
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_security: Mapped[str] = mapped_column(String(10), default="starttls")  # none|starttls|ssl
    smtp_user: Mapped[str] = mapped_column(String(255), default="")
    smtp_password_enc: Mapped[str] = mapped_column(Text, default="")
    mail_from: Mapped[str] = mapped_column(String(320), default="")
    # Branding of emails (and of the app later)
    brand_name: Mapped[str] = mapped_column(String(120), default="")
    brand_color: Mapped[str] = mapped_column(String(7), default="")  # "#0F766E"
    brand_footer: Mapped[str] = mapped_column(Text, default="")
    logo: Mapped[bytes | None] = mapped_column(LargeBinary)
    logo_type: Mapped[str] = mapped_column(String(40), default="")
    # Wording overrides: {"task": {"fr": {"subject": "...", "intro": "..."}}}
    email_texts: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
