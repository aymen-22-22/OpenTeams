"""SMTP settings in the Administration page, and a test email."""

import asyncio
import smtplib
from email.utils import parseaddr
from typing import Annotated, Literal

from fastapi import APIRouter
from pydantic import AfterValidator, BaseModel, EmailStr, Field

from app.admin import audit
from app.admin.org import SMTP_TIMEOUT, env_smtp, get_org, send_sync, smtp_config
from app.auth.deps import DB, AdminUser
from app.core.crypto import encrypt
from app.core.errors import AppError
from app.reminders.email import render_notification

router = APIRouter(prefix="/admin/email", tags=["admin"])

Security = Literal["none", "starttls", "ssl"]


def _sender(value: str) -> str:
    if value and "@" not in parseaddr(value)[1]:
        raise ValueError("Sender must be an email address, e.g. OpenTeams <no-reply@example.com>")
    return value


class EmailSettingsOut(BaseModel):
    host: str
    port: int
    security: Security
    user: str
    password_set: bool  # the password itself is never returned
    mail_from: str
    source: Literal["admin", "env"]  # which settings are used now
    env_host: str  # the .env server, used when no server is set here


class EmailSettingsIn(BaseModel):
    host: str = Field(default="", max_length=255)  # empty: use the .env settings
    port: int = Field(default=587, ge=1, le=65535)
    security: Security = "starttls"
    user: str = Field(default="", max_length=255)
    password: str | None = Field(default=None, max_length=256)  # None keeps it, "" clears it
    mail_from: Annotated[str, AfterValidator(_sender)] = Field(default="", max_length=320)


class TestEmailIn(BaseModel):
    to: EmailStr


async def _out(db: DB) -> EmailSettingsOut:
    org = await get_org(db)
    current = await smtp_config(db)
    return EmailSettingsOut(
        host=org.smtp_host,
        port=org.smtp_port,
        security=org.smtp_security,
        user=org.smtp_user,
        password_set=bool(org.smtp_password_enc),
        mail_from=org.mail_from,
        source=current.source,
        env_host=env_smtp().host,
    )


@router.get("", response_model=EmailSettingsOut)
async def get_email_settings(_: AdminUser, db: DB) -> EmailSettingsOut:
    out = await _out(db)
    await db.commit()  # the settings row may have just been created
    return out


@router.put("", response_model=EmailSettingsOut)
async def set_email_settings(body: EmailSettingsIn, admin: AdminUser, db: DB) -> EmailSettingsOut:
    org = await get_org(db)
    org.smtp_host, org.smtp_port, org.smtp_security = body.host.strip(), body.port, body.security
    org.smtp_user, org.mail_from = body.user.strip(), body.mail_from.strip()
    changed = ["smtp"]
    if body.password is not None:
        org.smtp_password_enc = encrypt(body.password) if body.password else ""
        changed.append("password")
    audit.record(
        db, admin.id, "admin.email_settings_updated", "org_settings", org.id, fields=changed
    )
    await db.commit()
    return await _out(db)


@router.post("/test", status_code=204)
async def send_test_email(body: TestEmailIn, admin: AdminUser, db: DB) -> None:
    """Send one email now with the settings in effect and report the result.

    The only request that talks to the mail server directly: that is its purpose.
    """
    config = await smtp_config(db)
    rendered = render_notification("message", "OpenTeams", "✓ SMTP", "/", admin.locale)
    try:
        await asyncio.wait_for(
            asyncio.to_thread(
                send_sync, config, body.to, rendered.subject, rendered.html, rendered.text
            ),
            timeout=SMTP_TIMEOUT + 5,
        )
    except (OSError, smtplib.SMTPException, TimeoutError) as exc:
        code = getattr(exc, "smtp_code", None)
        reason = "auth" if isinstance(exc, smtplib.SMTPAuthenticationError) else type(exc).__name__
        raise AppError(
            "smtp_failed",
            "The mail server refused or could not be reached",
            502,
            details={"reason": reason, "code": code},
        ) from exc
    audit.record(db, admin.id, "admin.email_test_sent", "org_settings", None)
    await db.commit()
