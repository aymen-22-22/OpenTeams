"""Email rendering (Jinja2, inline CSS, plain-text twin) and SMTP sending."""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.admin.org import SmtpConfig, env_smtp, send_sync
from app.bridge.parse import html_to_text
from app.core.settings import get_settings
from app.reminders.brand import DEFAULT_BRAND, Brand
from app.reminders.custom_html import fill

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
        "view": "Voir",
        "footer": "Vous recevez cet e-mail via {name}.",
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
        "view": "View",
        "footer": "You receive this email from {name}.",
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
        "view": "عرض",
        "footer": "تصلك هذه الرسالة من {name}.",
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


# Notification types whose body is a person's message (shown as a quote)
QUOTED = {"message", "mention"}
DIGEST_GROUP_LIMIT = 10  # items listed per type; the rest is counted ("and 4 more")


def _base_context(subject: str, lang: str, brand: Brand) -> dict[str, Any]:
    base = get_settings().app_url.rstrip("/")
    return {
        "brand": brand,
        "footer": TEXTS[lang]["footer"].format(name=brand.name),
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


def render_notification(
    kind: str, title: str, body: str, link: str, lang: str, brand: Brand = DEFAULT_BRAND
) -> RenderedEmail:
    lang = _lang(lang)
    t = TEXTS[lang]
    label = brand.text(kind, lang, "subject") or t.get(kind, brand.name)
    ctx = _base_context(f"{label}{t['sep']}{title}", lang, brand)
    ctx |= {
        "title": title,
        "body": body,
        "intro": brand.text(kind, lang, "intro"),
        "link_url": f"{ctx['base_url']}{link}",
        "kind_label": label,
        "quote": kind in QUOTED,  # the body is someone's words: shown as a quote
        "preheader": (body or title)[:120],
    }
    custom = brand.text(kind, lang, "html")
    if custom:
        values = _custom_values(ctx, brand) | {
            "title": title,
            "body": body,
            "link": ctx["link_url"],
        }
        return _render_custom(custom, values, ctx)
    return _render("notification", ctx)


def render_digest(
    entries: list[DigestEntry], lang: str, brand: Brand = DEFAULT_BRAND
) -> RenderedEmail:
    """One email listing many notifications, grouped by type in a stable order."""
    lang = _lang(lang)
    t = TEXTS[lang]
    subject = brand.text("digest", lang, "subject") or t["digest_subject"]
    ctx = _base_context(subject.replace("{n}", str(len(entries))), lang, brand)
    ctx["intro"] = brand.text("digest", lang, "intro") or t["digest_intro"]
    ctx["preheader"] = ctx["intro"][:120]
    groups = []
    for kind in dict.fromkeys(e.kind for e in entries):
        items = [e for e in entries if e.kind == kind]
        groups.append(
            {
                "label": brand.text(kind, lang, "subject") or t.get(kind, kind),
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
    custom = brand.text("digest", lang, "html")
    if custom:
        items_html = _env.get_template("digest_items.html").render(ctx)
        values = _custom_values(ctx, brand) | {
            "title": ctx["subject"],
            "count": str(len(entries)),
            "items": items_html,
            "link": f"{ctx['base_url']}/",
        }
        return _render_custom(custom, values, ctx)
    return _render("digest", ctx)


def _custom_values(ctx: dict[str, Any], brand: Brand) -> dict[str, str]:
    return {
        "subject": ctx["subject"],
        "intro": ctx.get("intro", ""),
        "brand_name": brand.name,
        "brand_color": brand.color,
        "on_color": brand.on_color,
        "logo_url": brand.logo_url,
        "preferences_url": ctx["preferences_url"],
        "app_url": ctx["base_url"],
    }


def _render_custom(template: str, values: dict[str, str], ctx: dict[str, Any]) -> RenderedEmail:
    """An admin's HTML, filled with escaped values; the text version is derived from it."""
    html = fill(template, values)
    footer = f"{ctx['t']['preferences']}: {ctx['preferences_url']}"
    text = f"{html_to_text(html)}\n\n{values.get('link', '')}\n\n{footer}"
    return RenderedEmail(subject=ctx["subject"], html=html, text=text.strip())


async def send_email(
    to: str, subject: str, html: str, text: str, config: "SmtpConfig | None" = None
) -> None:
    """Send now (only the outbox job and the admin test call this; requests never wait on SMTP)."""
    await asyncio.to_thread(send_sync, config or env_smtp(), to, subject, html, text)
