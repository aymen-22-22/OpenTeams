"""Organization settings: the single settings row and the SMTP configuration in effect."""

import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.models import OrgSettings
from app.core.crypto import decrypt
from app.core.settings import get_settings

SMTP_TIMEOUT = 20


@dataclass(frozen=True)
class SmtpConfig:
    host: str
    port: int
    security: str  # none | starttls | ssl
    user: str
    password: str
    mail_from: str
    source: str  # "admin" (set in the Administration page) or "env"


async def get_org(db: AsyncSession) -> OrgSettings:
    """The settings row, created empty on first use."""
    org = await db.scalar(select(OrgSettings).limit(1))
    if org is None:
        org = OrgSettings()
        db.add(org)
        await db.flush()
    return org


def env_smtp() -> SmtpConfig:
    s = get_settings()
    return SmtpConfig(
        host=s.smtp_host,
        port=s.smtp_port,
        security="starttls" if s.smtp_starttls else "none",
        user=s.smtp_user,
        password=s.smtp_password,
        mail_from=s.mail_from,
        source="env",
    )


async def smtp_config(db: AsyncSession) -> SmtpConfig:
    """Settings from the Administration page when a server is set there, else the .env ones."""
    org = await db.scalar(select(OrgSettings).limit(1))
    if org is None or not org.smtp_host:
        return env_smtp()
    return SmtpConfig(
        host=org.smtp_host,
        port=org.smtp_port,
        security=org.smtp_security,
        user=org.smtp_user,
        password=(decrypt(org.smtp_password_enc) or "") if org.smtp_password_enc else "",
        mail_from=org.mail_from or get_settings().mail_from,
        source="admin",
    )


def send_sync(config: SmtpConfig, to: str, subject: str, html: str, text: str) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = config.mail_from, to, subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    context = ssl.create_default_context()
    smtp: smtplib.SMTP
    if config.security == "ssl":
        smtp = smtplib.SMTP_SSL(config.host, config.port, timeout=SMTP_TIMEOUT, context=context)
    else:
        smtp = smtplib.SMTP(config.host, config.port, timeout=SMTP_TIMEOUT)
    with smtp:
        if config.security == "starttls":
            smtp.starttls(context=context)
        if config.user:
            smtp.login(config.user, config.password)
        smtp.send_message(msg)
