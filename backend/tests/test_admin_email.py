"""SMTP settings in the Administration page: stored encrypted, used by the outbox, testable."""

import smtplib
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.admin import email_router
from app.admin.models import AuditLog, OrgSettings
from app.admin.org import SmtpConfig, send_sync
from app.core import clock
from app.core.crypto import decrypt
from app.core.db import SessionLocal
from app.reminders import email, jobs
from app.reminders.models import EmailOutbox, EmailStatus
from tests.conftest import make_user, new_client

URL = "/api/v1/admin/email"
SETTINGS = {
    "host": "smtp.example.com",
    "port": 465,
    "security": "ssl",
    "user": "notify@example.com",
    "password": "s3cret-smtp-password",
    "mail_from": "SDG Teams <notify@example.com>",
}


async def org() -> OrgSettings:
    async with SessionLocal() as db:
        row = await db.scalar(select(OrgSettings))
        assert row is not None
        return row


async def test_defaults_use_env(admin_client: AsyncClient) -> None:
    r = await admin_client.get(URL)
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "env" and data["host"] == "" and data["password_set"] is False
    assert data["env_host"]  # tells the admin which .env server is used


async def test_save_settings_password_is_write_only_and_encrypted(
    admin_client: AsyncClient,
) -> None:
    r = await admin_client.put(URL, json=SETTINGS)
    assert r.status_code == 200
    data = r.json()
    assert "password" not in data and SETTINGS["password"] not in r.text
    assert data["password_set"] is True and data["source"] == "admin" and data["security"] == "ssl"
    row = await org()
    assert row.smtp_password_enc != SETTINGS["password"]
    assert decrypt(row.smtp_password_enc) == SETTINGS["password"]
    # Saving without a password keeps it; an empty one clears it.
    keep = {k: v for k, v in SETTINGS.items() if k != "password"} | {
        "port": 587,
        "security": "starttls",
    }
    assert (await admin_client.put(URL, json=keep)).json()["password_set"] is True
    assert decrypt((await org()).smtp_password_enc) == SETTINGS["password"]
    assert (await admin_client.put(URL, json=keep | {"password": ""})).json()[
        "password_set"
    ] is False
    # An empty server falls back to .env.
    assert (await admin_client.put(URL, json=keep | {"host": ""})).json()["source"] == "env"
    async with SessionLocal() as db:
        details = [str(a.details) for a in await db.scalars(select(AuditLog))]
    assert details and all(SETTINGS["password"] not in d for d in details)


@pytest.mark.parametrize(
    "bad",
    [
        {"security": "tls"},
        {"port": 0},
        {"port": 70000},
        {"mail_from": "not an address"},
        {"host": "x" * 300},
    ],
)
async def test_validation(admin_client: AsyncClient, bad: dict[str, Any]) -> None:
    assert (await admin_client.put(URL, json=SETTINGS | bad)).status_code == 422


async def test_admin_only(employee_client: AsyncClient) -> None:
    assert (await employee_client.get(URL)).status_code == 403
    assert (await employee_client.put(URL, json=SETTINGS)).status_code == 403
    assert (
        await employee_client.post(f"{URL}/test", json={"to": "a@example.com"})
    ).status_code == 403
    anonymous = await new_client()
    assert (await anonymous.get(URL)).status_code == 401
    await anonymous.aclose()


async def test_outbox_uses_the_admin_settings(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await admin_client.put(URL, json=SETTINGS)
    used: list[SmtpConfig] = []
    monkeypatch.setattr(email, "send_sync", lambda config, *a: used.append(config))
    async with SessionLocal() as db:
        db.add(
            EmailOutbox(
                to_email="lucas@example.com",
                subject="s",
                html="<p>h</p>",
                text="t",
                next_attempt_at=clock.now(),
            )
        )
        await db.commit()
    assert await jobs.send_outbox(clock.now()) == 1
    assert used[0].host == "smtp.example.com" and used[0].security == "ssl"
    assert used[0].password == SETTINGS["password"] and used[0].source == "admin"
    async with SessionLocal() as db:
        assert (await db.scalar(select(EmailOutbox))).status == EmailStatus.SENT  # type: ignore[union-attr]


async def test_test_email_success(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[Any, ...]] = []
    monkeypatch.setattr(email_router, "send_sync", lambda *a: sent.append(a))
    r = await admin_client.post(f"{URL}/test", json={"to": "me@example.com"})
    assert r.status_code == 204
    config, to, subject, html, text = sent[0]
    assert config.source == "env" and to == "me@example.com" and "<html" in html and text


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (smtplib.SMTPAuthenticationError(535, b"bad credentials"), "auth"),
        (ConnectionRefusedError(), "ConnectionRefusedError"),
        (TimeoutError(), "TimeoutError"),
    ],
)
async def test_test_email_reports_why_it_failed(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch, error: Exception, reason: str
) -> None:
    def fail(*_: Any) -> None:
        raise error

    monkeypatch.setattr(email_router, "send_sync", fail)
    r = await admin_client.post(f"{URL}/test", json={"to": "me@example.com"})
    assert r.status_code == 502
    assert (
        r.json()["error"]["code"] == "smtp_failed"
        and r.json()["error"]["details"]["reason"] == reason
    )
    assert "bad credentials" not in r.text


async def test_test_email_validation(admin_client: AsyncClient) -> None:
    assert (await admin_client.post(f"{URL}/test", json={"to": "nope"})).status_code == 422


class FakeSMTP:
    log: list[tuple[Any, ...]] = []

    def __init__(self, host: str, port: int, **kw: Any) -> None:
        self.log.append((type(self).__name__, host, port))

    def __enter__(self) -> "FakeSMTP":
        return self

    def __exit__(self, *_: Any) -> None:
        pass

    def starttls(self, **_: Any) -> None:
        self.log.append(("starttls",))

    def login(self, user: str, password: str) -> None:
        self.log.append(("login", user))

    def send_message(self, msg: Any) -> None:
        self.log.append(("send", msg["From"], msg["To"]))


class FakeSMTPSSL(FakeSMTP):
    pass


@pytest.mark.parametrize(
    ("security", "expected"),
    [
        ("ssl", [("FakeSMTPSSL", "h", 465), ("login", "u"), ("send", "Me <me@x.dz>", "a@x.dz")]),
        (
            "starttls",
            [
                ("FakeSMTP", "h", 465),
                ("starttls",),
                ("login", "u"),
                ("send", "Me <me@x.dz>", "a@x.dz"),
            ],
        ),
        ("none", [("FakeSMTP", "h", 465), ("login", "u"), ("send", "Me <me@x.dz>", "a@x.dz")]),
    ],
)
def test_send_sync_security_modes(
    monkeypatch: pytest.MonkeyPatch, security: str, expected: list[Any]
) -> None:
    FakeSMTP.log = []
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTPSSL)
    config = SmtpConfig("h", 465, security, "u", "p", "Me <me@x.dz>", "admin")
    send_sync(config, "a@x.dz", "Subject", "<p>x</p>", "x")
    assert FakeSMTP.log == expected


# --- branding, logo, wording, preview -------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def test_branding_applies_to_emails(admin_client: AsyncClient) -> None:
    r = await admin_client.put(
        f"{URL}/branding",
        json={"name": "SDG Consulting", "color": "#1d4ed8", "footer": "SDG · Alger"},
    )
    assert r.status_code == 200 and r.json() == {
        "name": "SDG Consulting",
        "color": "#1d4ed8",
        "footer": "SDG · Alger",
        "has_logo": False,
    }
    preview = (
        await admin_client.post(f"{URL}/preview", json={"kind": "task", "lang": "fr"})
    ).json()
    assert (
        "SDG Consulting" in preview["html"]
        and "#1d4ed8" in preview["html"]
        and "#0F766E" not in preview["html"]
    )
    assert "SDG · Alger" in preview["html"] and "SDG · Alger" in preview["text"]
    assert "via SDG Consulting" in preview["html"]
    assert preview["subject"] == "Tâche : Préparer le rapport mensuel"


@pytest.mark.parametrize(
    "bad", [{"color": "blue"}, {"color": "#12345"}, {"name": "x" * 121}, {"footer": "x" * 501}]
)
async def test_branding_validation(admin_client: AsyncClient, bad: dict[str, Any]) -> None:
    assert (await admin_client.put(f"{URL}/branding", json=bad)).status_code == 422


async def test_light_color_gets_dark_text(admin_client: AsyncClient) -> None:
    await admin_client.put(f"{URL}/branding", json={"color": "#fde047"})
    html = (await admin_client.post(f"{URL}/preview", json={})).json()["html"]
    assert "color:#111111" in html


async def test_logo_upload_public_serving_and_removal(admin_client: AsyncClient) -> None:
    assert (await admin_client.put(f"{URL}/logo", content=PNG)).status_code == 204
    assert (await admin_client.get(f"{URL}/branding")).json()["has_logo"] is True
    anonymous = await new_client()
    r = await anonymous.get("/api/v1/branding/logo")
    assert r.status_code == 200 and r.content == PNG and r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"
    html = (await admin_client.post(f"{URL}/preview", json={})).json()["html"]
    assert "/api/v1/branding/logo?v=" in html
    assert (await admin_client.delete(f"{URL}/logo")).status_code == 204
    assert (await anonymous.get("/api/v1/branding/logo")).status_code == 404
    await anonymous.aclose()


@pytest.mark.parametrize(
    ("content", "status"),
    [
        (b"<svg onload=alert(1)></svg>", 415),
        (b"GIF89a....", 415),
        (b"\x89PNG\r\n\x1a\n" + b"0" * (300 * 1024), 413),
    ],
)
async def test_logo_rejected(admin_client: AsyncClient, content: bytes, status: int) -> None:
    r = await admin_client.put(
        f"{URL}/logo", content=content, headers={"Content-Type": "image/png"}
    )
    assert r.status_code == status


async def test_texts_defaults_overrides_and_rendering(admin_client: AsyncClient) -> None:
    data = (await admin_client.get(f"{URL}/texts")).json()
    assert data["defaults"]["task"]["fr"] == {"subject": "Tâche", "intro": "", "html": ""}
    assert data["defaults"]["digest"]["en"]["subject"].startswith("Your daily summary")
    assert data["overrides"] == {}
    r = await admin_client.put(
        f"{URL}/texts",
        json={
            "task": {
                "fr": {"subject": "Nouvelle mission", "intro": "Bonjour,\nune tâche vous attend."},
                "en": {"subject": "", "intro": ""},
            },
            "digest": {"fr": {"subject": "Votre journée chez SDG : {n} nouveautés", "intro": ""}},
        },
    )
    assert r.status_code == 200
    assert r.json()["overrides"] == {  # empty entries are not stored
        "task": {
            "fr": {
                "subject": "Nouvelle mission",
                "intro": "Bonjour,\nune tâche vous attend.",
                "html": "",
            }
        },
        "digest": {
            "fr": {"subject": "Votre journée chez SDG : {n} nouveautés", "intro": "", "html": ""}
        },
    }
    task = (await admin_client.post(f"{URL}/preview", json={"kind": "task", "lang": "fr"})).json()
    assert task["subject"] == "Nouvelle mission : Préparer le rapport mensuel"
    assert "une tâche vous attend." in task["html"] and "une tâche vous attend." in task["text"]
    english = (
        await admin_client.post(f"{URL}/preview", json={"kind": "task", "lang": "en"})
    ).json()
    assert english["subject"] == "Task: Prepare the monthly report"  # default kept
    digest = (
        await admin_client.post(f"{URL}/preview", json={"kind": "digest", "lang": "fr"})
    ).json()
    assert digest["subject"] == "Votre journée chez SDG : 4 nouveautés"
    assert "Nouvelle mission" in digest["html"]  # group label follows the override


async def test_real_notifications_use_branding_and_texts(admin_client: AsyncClient) -> None:
    await admin_client.put(f"{URL}/branding", json={"name": "SDG Consulting", "color": "#1d4ed8"})
    await admin_client.put(
        f"{URL}/texts", json={"task": {"fr": {"subject": "Mission", "intro": "Bonjour"}}}
    )
    lucas = await make_user("lucas@example.com")
    await admin_client.post("/api/v1/tasks", json={"title": "Budget", "assignee_id": str(lucas.id)})
    async with SessionLocal() as db:
        mail = await db.scalar(select(EmailOutbox))
    assert mail is not None and mail.subject == "Mission : Budget"
    assert "SDG Consulting" in mail.html and "#1d4ed8" in mail.html and "Bonjour" in mail.html


@pytest.mark.parametrize(
    "bad",
    [
        {"spam": {"fr": {"subject": "x"}}},
        {"task": {"de": {"subject": "x"}}},
        {"task": {"fr": {"subject": "x" * 151}}},
    ],
)
async def test_texts_validation(admin_client: AsyncClient, bad: dict[str, Any]) -> None:
    assert (await admin_client.put(f"{URL}/texts", json=bad)).status_code == 422


async def test_preview_with_unsaved_changes_does_not_save(admin_client: AsyncClient) -> None:
    r = await admin_client.post(
        f"{URL}/preview",
        json={
            "kind": "mention",
            "lang": "ar",
            "branding": {"name": "Brouillon", "color": "#7c3aed", "footer": ""},
            "texts": {"mention": {"ar": {"subject": "تنبيه", "intro": ""}}},
        },
    )
    data = r.json()
    assert (
        "Brouillon" in data["html"]
        and 'dir="rtl"' in data["html"]
        and data["subject"].startswith("تنبيه")
    )
    assert (await admin_client.get(f"{URL}/branding")).json()["name"] == ""  # nothing saved


async def test_test_email_of_a_given_type(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[Any, ...]] = []
    monkeypatch.setattr(email_router, "send_sync", lambda *a: sent.append(a))
    r = await admin_client.post(
        f"{URL}/test", json={"to": "me@example.com", "kind": "digest", "lang": "en"}
    )
    assert r.status_code == 204 and sent[0][2].startswith("Your daily summary")


async def test_branding_admin_only(employee_client: AsyncClient) -> None:
    for method, path in (
        ("get", "/branding"),
        ("put", "/branding"),
        ("put", "/logo"),
        ("delete", "/logo"),
        ("get", "/texts"),
        ("put", "/texts"),
        ("post", "/preview"),
    ):
        assert (
            await employee_client.request(method.upper(), f"{URL}{path}", json={})
        ).status_code == 403


# --- custom HTML per email type ---------------------------------------------------------

CUSTOM = (
    "<html><body style='background:{{brand_color}}'><h1>{{title}}</h1><p>{{body}}</p>"
    "<a href='{{link}}'>Voir</a> {{unknown}} "
    "<a href='{{preferences_url}}'>Préférences</a></body></html>"
)


async def test_custom_html_is_used_with_escaped_values(admin_client: AsyncClient) -> None:
    data = (await admin_client.get(f"{URL}/texts")).json()
    assert "{{preferences_url}}" in data["starter_html"] and "items" in data["variables"]
    r = await admin_client.put(
        f"{URL}/texts", json={"task": {"fr": {"subject": "", "intro": "", "html": CUSTOM}}}
    )
    assert r.status_code == 200
    # A real notification with a hostile title: values are escaped, never executed.
    lucas = await make_user("lucas@example.com")
    await admin_client.post(
        "/api/v1/tasks",
        json={"title": "<img src=x onerror=alert(1)>", "assignee_id": str(lucas.id)},
    )
    async with SessionLocal() as db:
        mail = await db.scalar(select(EmailOutbox))
    assert mail is not None
    assert "&lt;img src=x onerror=alert(1)&gt;" in mail.html and "<img src=x" not in mail.html
    assert (
        "background:#0F766E" in mail.html and "/tasks/" in mail.html and "/preferences" in mail.html
    )
    assert "{{unknown}}" in mail.html  # unknown variables are left visible, not evaluated
    assert "<h1>" not in mail.text and "/preferences" in mail.text  # derived plain text, no tags
    # Other languages keep the built-in design.
    en = (await admin_client.post(f"{URL}/preview", json={"kind": "task", "lang": "en"})).json()
    assert "<h1>" not in en["html"]


async def test_custom_html_is_not_a_template_engine(admin_client: AsyncClient) -> None:
    attack = "{{ ''.__class__.__mro__ }} {% for x in range(3) %}x{% endfor %} {{7*7}} "
    attack += "{{preferences_url}}"
    await admin_client.put(
        f"{URL}/texts", json={"mention": {"fr": {"subject": "", "intro": "", "html": attack}}}
    )
    html = (
        await admin_client.post(f"{URL}/preview", json={"kind": "mention", "lang": "fr"})
    ).json()["html"]
    assert (
        "{{ ''.__class__.__mro__ }}" in html
        and "{% for x in range(3) %}" in html
        and "{{7*7}}" in html
    )
    assert "49" not in html and "xxx" not in html


async def test_custom_digest_html_gets_items(admin_client: AsyncClient) -> None:
    html = "<div>{{count}} nouveautés</div>{{items}}<a href='{{preferences_url}}'>p</a>"
    await admin_client.put(
        f"{URL}/texts", json={"digest": {"fr": {"subject": "", "intro": "", "html": html}}}
    )
    out = (await admin_client.post(f"{URL}/preview", json={"kind": "digest", "lang": "fr"})).json()
    assert "<div>4 nouveautés</div>" in out["html"] and "Préparer le rapport mensuel" in out["html"]
    assert ">Voir</a>" in out["html"]  # items are our own HTML, inserted as is


@pytest.mark.parametrize(
    "html",
    [
        "<p>no preferences link</p>",
        "<script>alert(1)</script>{{preferences_url}}",
        "< SCRIPT src=x></script>{{preferences_url}}",
        "{{preferences_url}}" + "x" * 100_001,
    ],
)
async def test_custom_html_validation(admin_client: AsyncClient, html: str) -> None:
    r = await admin_client.put(
        f"{URL}/texts", json={"task": {"fr": {"subject": "", "intro": "", "html": html}}}
    )
    assert r.status_code == 422


async def test_preview_of_unsaved_custom_html(admin_client: AsyncClient) -> None:
    r = await admin_client.post(
        f"{URL}/preview",
        json={"kind": "task", "lang": "fr", "texts": {"task": {"fr": {"html": CUSTOM}}}},
    )
    assert "<h1>Préparer le rapport mensuel</h1>" in r.json()["html"]
    assert (await admin_client.get(f"{URL}/texts")).json()["overrides"] == {}


async def test_send_all_examples_goes_through_the_outbox(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        email_router, "send_sync", lambda *a: pytest.fail("no SMTP during the request")
    )
    r = await admin_client.post(f"{URL}/test-all", json={"to": "me@example.com", "lang": "ar"})
    assert r.status_code == 202 and r.json() == {"queued": 9}
    r = await admin_client.post(f"{URL}/test-all", json={"to": "me@example.com"})
    assert r.json() == {"queued": 27}
    async with SessionLocal() as db:
        mails = list(await db.scalars(select(EmailOutbox)))
    assert len(mails) == 36 and all(m.to_email == "me@example.com" for m in mails)
    subjects = {m.subject for m in mails}
    assert any(s.startswith("[AR] ") for s in subjects) and any(
        s.startswith("[EN] Your daily summary") for s in subjects
    )


async def test_send_all_examples_validation_and_access(
    admin_client: AsyncClient, employee_client: AsyncClient
) -> None:
    assert (await admin_client.post(f"{URL}/test-all", json={"to": "nope"})).status_code == 422
    assert (
        await admin_client.post(f"{URL}/test-all", json={"to": "a@b.dz", "lang": "de"})
    ).status_code == 422
    assert (await employee_client.post(f"{URL}/test-all", json={"to": "a@b.dz"})).status_code == 403
