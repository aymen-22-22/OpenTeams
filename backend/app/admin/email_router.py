"""SMTP settings in the Administration page, and a test email."""

import asyncio
import smtplib
from dataclasses import replace
from email.utils import parseaddr
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request
from pydantic import AfterValidator, BaseModel, EmailStr, Field

from app.admin import audit
from app.admin.org import (
    SMTP_TIMEOUT,
    brand_of,
    email_brand,
    env_smtp,
    get_org,
    send_sync,
    smtp_config,
)
from app.auth.deps import DB, AdminUser
from app.core.crypto import encrypt
from app.core.errors import AppError
from app.reminders import custom_html
from app.reminders.brand import DEFAULT_BRAND, Brand
from app.reminders.email import (
    TEXTS,
    DigestEntry,
    RenderedEmail,
    render_digest,
    render_notification,
)

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


KINDS = ("message", "reminder", "file", "task", "approval", "report", "event", "mention", "digest")
Kind = Literal[
    "test",
    "message",
    "reminder",
    "file",
    "task",
    "approval",
    "report",
    "event",
    "mention",
    "digest",
]
Lang = Literal["fr", "en", "ar"]
LOGO_TYPES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}
MAX_LOGO_BYTES = 300 * 1024


class TestEmailIn(BaseModel):
    to: EmailStr
    kind: Kind = "test"
    lang: Lang | None = None  # default: the admin's language


class Branding(BaseModel):
    name: str = Field(default="", max_length=120)
    color: str = Field(default="", pattern=r"^(#[0-9a-fA-F]{6})?$")
    footer: str = Field(default="", max_length=500)


class BrandingOut(Branding):
    has_logo: bool


def _custom_html(value: str) -> str:
    if value.strip():
        found = custom_html.problems(value)
        if found:
            raise ValueError(f"Invalid custom HTML: {', '.join(found)}")
    return value


class EmailText(BaseModel):
    subject: str = Field(default="", max_length=150)
    intro: str = Field(default="", max_length=1000)
    # Admin-written HTML for the whole email (empty: the built-in design)
    html: Annotated[str, AfterValidator(_custom_html)] = Field(
        default="", max_length=custom_html.MAX_SIZE
    )


# kind -> lang -> texts; only what differs from the defaults is stored
Texts = dict[Literal[KINDS], dict[Lang, EmailText]]  # type: ignore[valid-type]


class TextsOut(BaseModel):
    defaults: dict[str, dict[str, EmailText]]
    overrides: dict[str, dict[str, EmailText]]
    starter_html: str  # a starting point for custom HTML
    variables: list[str]  # what {{name}} can be used in custom HTML


class PreviewIn(BaseModel):
    kind: Kind = "task"
    lang: Lang = "fr"
    branding: Branding | None = None  # unsaved changes, to preview before saving
    texts: Texts | None = None


class PreviewOut(BaseModel):
    subject: str
    html: str
    text: str


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


# --- branding, wording, preview ---------------------------------------------------------

SAMPLES = {
    "fr": {
        "message": ("Amina Benali", "Tu peux relire le contrat avant midi ?"),
        "reminder": ("Appeler le fournisseur", ""),
        "file": ("devis-2027.pdf", "Lucas Martin"),
        "task": ("Préparer le rapport mensuel", "Amina Benali"),
        "approval": ("Congés du 12 au 16 mai", "Lucas Martin"),
        "report": ("Rapport hebdomadaire", "12 tâches terminées, 3 en retard"),
        "event": ("Point équipe", "Lundi 10:00"),
        "mention": ("Amina Benali · #général", "@Lucas peux-tu valider ?"),
        "test": ("OpenTeams", "✓ SMTP"),
    },
    "en": {
        "message": ("Amina Benali", "Can you review the contract before noon?"),
        "reminder": ("Call the supplier", ""),
        "file": ("quote-2027.pdf", "Lucas Martin"),
        "task": ("Prepare the monthly report", "Amina Benali"),
        "approval": ("Leave 12–16 May", "Lucas Martin"),
        "report": ("Weekly report", "12 tasks finished, 3 overdue"),
        "event": ("Team meeting", "Monday 10:00"),
        "mention": ("Amina Benali · #general", "@Lucas can you approve?"),
        "test": ("OpenTeams", "✓ SMTP"),
    },
    "ar": {
        "message": ("أمينة بن علي", "هل يمكنك مراجعة العقد قبل الظهر؟"),
        "reminder": ("الاتصال بالمورد", ""),
        "file": ("عرض-2027.pdf", "لوكاس مارتن"),
        "task": ("إعداد التقرير الشهري", "أمينة بن علي"),
        "approval": ("إجازة من 12 إلى 16 مايو", "لوكاس مارتن"),
        "report": ("التقرير الأسبوعي", "12 مهمة منتهية، 3 متأخرة"),
        "event": ("اجتماع الفريق", "الاثنين 10:00"),
        "mention": ("أمينة بن علي · #عام", "@لوكاس هل يمكنك الموافقة؟"),
        "test": ("OpenTeams", "✓ SMTP"),
    },
}


def _sample(kind: str, lang: str, brand: Brand) -> RenderedEmail:
    samples = SAMPLES[lang]
    if kind == "digest":
        entries = [DigestEntry(k, *samples[k], "/") for k in ("task", "task", "message", "mention")]
        return render_digest(entries, lang, brand)
    title, text = samples[kind]
    return render_notification(kind if kind != "test" else "message", title, text, "/", lang, brand)


def _texts_dump(texts: Texts) -> dict[str, Any]:
    """Only non-empty overrides are kept."""
    out: dict[str, Any] = {}
    for kind, langs in texts.items():
        for lang, value in langs.items():
            if value.subject.strip() or value.intro.strip() or value.html.strip():
                out.setdefault(kind, {})[lang] = value.model_dump()
    return out


@router.get("/branding", response_model=BrandingOut)
async def get_branding(_: AdminUser, db: DB) -> BrandingOut:
    org = await get_org(db)
    await db.commit()
    return BrandingOut(
        name=org.brand_name,
        color=org.brand_color,
        footer=org.brand_footer,
        has_logo=org.logo is not None,
    )


@router.put("/branding", response_model=BrandingOut)
async def set_branding(body: Branding, admin: AdminUser, db: DB) -> BrandingOut:
    org = await get_org(db)
    org.brand_name, org.brand_color, org.brand_footer = (
        body.name.strip(),
        body.color,
        body.footer.strip(),
    )
    audit.record(db, admin.id, "admin.branding_updated", "org_settings", org.id)
    await db.commit()
    return BrandingOut(**body.model_dump(), has_logo=org.logo is not None)


@router.put("/logo", status_code=204)
async def upload_logo(request: Request, admin: AdminUser, db: DB) -> None:
    """Raw PNG or JPEG body (checked by its first bytes, not by the declared type), max 300 KB."""
    data = await request.body()
    if len(data) > MAX_LOGO_BYTES:
        raise AppError("too_large", "Logo is too large (max 300 KB)", 413)
    kind = next((t for magic, t in LOGO_TYPES.items() if data.startswith(magic)), None)
    if kind is None:
        raise AppError("type_not_allowed", "Logo must be a PNG or JPEG image", 415)
    org = await get_org(db)
    org.logo, org.logo_type = data, kind
    audit.record(db, admin.id, "admin.logo_updated", "org_settings", org.id)
    await db.commit()


@router.delete("/logo", status_code=204)
async def delete_logo(admin: AdminUser, db: DB) -> None:
    org = await get_org(db)
    org.logo, org.logo_type = None, ""
    audit.record(db, admin.id, "admin.logo_removed", "org_settings", org.id)
    await db.commit()


@router.get("/texts", response_model=TextsOut)
async def get_texts(_: AdminUser, db: DB) -> TextsOut:
    org = await get_org(db)
    await db.commit()
    defaults: dict[str, dict[str, EmailText]] = {}
    for lang, t in TEXTS.items():
        for kind in KINDS:
            if kind == "digest":
                value = EmailText(subject=t["digest_subject"], intro=t["digest_intro"])
            else:
                value = EmailText(subject=t[kind], intro="")
            defaults.setdefault(kind, {})[lang] = value
    return TextsOut(
        defaults=defaults,
        overrides=org.email_texts or {},
        starter_html=custom_html.STARTER,
        variables=list(custom_html.VARIABLES),
    )


@router.put("/texts", response_model=TextsOut)
async def set_texts(body: Texts, admin: AdminUser, db: DB) -> TextsOut:
    org = await get_org(db)
    org.email_texts = _texts_dump(body)
    audit.record(db, admin.id, "admin.email_texts_updated", "org_settings", org.id)
    await db.commit()
    return await get_texts(admin, db)


@router.post("/preview", response_model=PreviewOut)
async def preview(body: PreviewIn, _: AdminUser, db: DB) -> PreviewOut:
    """Render a sample email with the saved settings, or with the unsaved ones sent here."""
    org = await get_org(db)
    brand = brand_of(org)
    if body.branding is not None:
        brand = replace(
            brand,
            name=body.branding.name.strip() or DEFAULT_BRAND.name,
            color=body.branding.color or DEFAULT_BRAND.color,
            footer=body.branding.footer.strip(),
        )
    if body.texts is not None:
        brand = replace(brand, texts=_texts_dump(body.texts))
    rendered = _sample(body.kind, body.lang, brand)
    await db.commit()
    return PreviewOut(subject=rendered.subject, html=rendered.html, text=rendered.text)


@router.post("/test", status_code=204)
async def send_test_email(body: TestEmailIn, admin: AdminUser, db: DB) -> None:
    """Send one email now with the settings in effect and report the result.

    The only request that talks to the mail server directly: that is its purpose.
    """
    config = await smtp_config(db)
    rendered = _sample(
        body.kind,
        body.lang or (admin.locale if admin.locale in TEXTS else "fr"),
        await email_brand(db),
    )
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
