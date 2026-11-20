"""Email rendering (Jinja2, inline CSS, plain-text twin) and SMTP sending."""

import asyncio
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.settings import get_settings

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
)

TEXTS = {
    "fr": {
        "message": "Nouveau message",
        "reminder": "Rappel",
        "file": "Nouveau fichier",
        "task": "Tâche",
        "approval": "Approbation",
        "sep": " : ",
        "open": "Ouvrir",
        "footer": "Vous recevez cet e-mail d'OpenTeams.",
        "preferences": "Gérer mes notifications",
    },
    "en": {
        "message": "New message",
        "reminder": "Reminder",
        "file": "New file",
        "task": "Task",
        "approval": "Approval",
        "sep": ": ",
        "open": "Open",
        "footer": "You receive this email from OpenTeams.",
        "preferences": "Manage my notifications",
    },
    "ar": {
        "message": "رسالة جديدة",
        "reminder": "تذكير",
        "file": "ملف جديد",
        "task": "مهمة",
        "approval": "موافقة",
        "sep": ": ",
        "open": "فتح",
        "footer": "تصلك هذه الرسالة من OpenTeams.",
        "preferences": "إدارة إشعاراتي",
    },
}


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


def render_notification(kind: str, title: str, body: str, link: str, lang: str) -> RenderedEmail:
    lang = lang if lang in TEXTS else "fr"
    t = TEXTS[lang]
    subject = f"{t.get(kind, 'OpenTeams')}{t['sep']}{title}"
    base = get_settings().app_url.rstrip("/")
    ctx = {
        "subject": subject,
        "title": title,
        "body": body,
        "link_url": f"{base}{link}",
        "preferences_url": f"{base}/preferences",
        "lang": lang,
        "dir": "rtl" if lang == "ar" else "ltr",
        "start": "right" if lang == "ar" else "left",  # email clients lack logical properties
        "t": t,
    }
    return RenderedEmail(
        subject=subject,
        html=_env.get_template("notification.html").render(ctx),
        text=_env.get_template("notification.txt").render(ctx),
    )


def _send_sync(to: str, subject: str, html: str, text: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.mail_from, to, subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
        if s.smtp_starttls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password)
        smtp.send_message(msg)


async def send_email(to: str, subject: str, html: str, text: str) -> None:
    await asyncio.to_thread(_send_sync, to, subject, html, text)
