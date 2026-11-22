"""Email rendering (Jinja2, inline CSS, plain-text twin) and SMTP sending."""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.admin.org import SmtpConfig, env_smtp, send_sync
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
        "report": "Rapport",
        "event": "Réunion",
        "mention": "Mention",
        "sep": " : ",
        "open": "Ouvrir",
        "footer": "Vous recevez cet e-mail d'OpenTeams.",
        "preferences": "Gérer mes notifications",
        "digest_subject": "Votre résumé quotidien : {n} notification(s)",
        "digest_intro": "Voici ce qui s'est passé depuis votre dernier résumé.",
        "more": "et {n} autre(s)",
        "open_app": "Ouvrir OpenTeams",
    },
    "en": {
        "message": "New message",
        "reminder": "Reminder",
        "file": "New file",
        "task": "Task",
        "approval": "Approval",
        "report": "Report",
        "event": "Meeting",
        "mention": "Mention",
        "sep": ": ",
        "open": "Open",
        "footer": "You receive this email from OpenTeams.",
        "preferences": "Manage my notifications",
        "digest_subject": "Your daily summary: {n} notification(s)",
        "digest_intro": "Here is what happened since your last summary.",
        "more": "and {n} more",
        "open_app": "Open OpenTeams",
    },
    "ar": {
        "message": "رسالة جديدة",
        "reminder": "تذكير",
        "file": "ملف جديد",
        "task": "مهمة",
        "approval": "موافقة",
        "report": "تقرير",
        "event": "اجتماع",
        "mention": "إشارة",
        "sep": ": ",
        "open": "فتح",
        "footer": "تصلك هذه الرسالة من OpenTeams.",
        "preferences": "إدارة إشعاراتي",
        "digest_subject": "ملخصك اليومي: {n} إشعار",
        "digest_intro": "إليك ما حدث منذ آخر ملخص.",
        "more": "و{n} أخرى",
        "open_app": "فتح OpenTeams",
    },
}


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


@dataclass(frozen=True)
class DigestEntry:
    kind: str
    title: str
    body: str
    link: str


DIGEST_GROUP_LIMIT = 10  # items listed per type; the rest is counted ("and 4 more")


def _base_context(subject: str, lang: str) -> dict[str, Any]:
    base = get_settings().app_url.rstrip("/")
    return {
        "subject": subject,
        "base_url": base,
        "preferences_url": f"{base}/preferences",
        "lang": lang,
        "dir": "rtl" if lang == "ar" else "ltr",
        "start": "right" if lang == "ar" else "left",  # email clients lack logical properties
        "t": TEXTS[lang],
    }


def _render(template: str, ctx: dict[str, Any]) -> RenderedEmail:
    return RenderedEmail(
        subject=ctx["subject"],
        html=_env.get_template(f"{template}.html").render(ctx),
        text=_env.get_template(f"{template}.txt").render(ctx),
    )


def _lang(lang: str) -> str:
    return lang if lang in TEXTS else "fr"


def render_notification(kind: str, title: str, body: str, link: str, lang: str) -> RenderedEmail:
    lang = _lang(lang)
    t = TEXTS[lang]
    ctx = _base_context(f"{t.get(kind, 'OpenTeams')}{t['sep']}{title}", lang)
    ctx |= {"title": title, "body": body, "link_url": f"{ctx['base_url']}{link}"}
    return _render("notification", ctx)


def render_digest(entries: list[DigestEntry], lang: str) -> RenderedEmail:
    """One email listing many notifications, grouped by type in a stable order."""
    lang = _lang(lang)
    t = TEXTS[lang]
    ctx = _base_context(t["digest_subject"].format(n=len(entries)), lang)
    groups = []
    for kind in dict.fromkeys(e.kind for e in entries):
        items = [e for e in entries if e.kind == kind]
        groups.append(
            {
                "label": t.get(kind, kind),
                "entries": [
                    {"title": e.title, "body": e.body[:200], "url": f"{ctx['base_url']}{e.link}"}
                    for e in items[:DIGEST_GROUP_LIMIT]
                ],
                "more": t["more"].format(n=len(items) - DIGEST_GROUP_LIMIT)
                if len(items) > DIGEST_GROUP_LIMIT
                else "",
            }
        )
    ctx["groups"] = groups
    return _render("digest", ctx)


async def send_email(
    to: str, subject: str, html: str, text: str, config: "SmtpConfig | None" = None
) -> None:
    """Send now (only the outbox job and the admin test call this; requests never wait on SMTP)."""
    await asyncio.to_thread(send_sync, config or env_smtp(), to, subject, html, text)
