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
from tests.conftest import new_client

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
