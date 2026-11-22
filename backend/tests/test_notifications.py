from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.reminders import email, jobs
from app.reminders.models import EmailOutbox, EmailStatus
from app.users.models import User
from tests.conftest import FakeClock, logged_in


@dataclass
class Pair:
    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient
    amina_user: User
    lucas_user: User


@pytest.fixture
async def pair() -> AsyncIterator[Pair]:
    amina, a = await logged_in("amina@example.com")
    lucas, lu = await logged_in("lucas@example.com")
    karim, _ = await logged_in("karim@example.com")
    yield Pair(amina, lucas, karim, a, lu)
    for c in (amina, lucas, karim):
        await c.aclose()


async def notifications(client: AsyncClient) -> Any:
    return (await client.get("/api/v1/notifications")).json()


async def outbox() -> list[EmailOutbox]:
    async with SessionLocal() as db:
        return list(await db.scalars(select(EmailOutbox).order_by(EmailOutbox.created_at)))


async def direct(p: Pair) -> str:
    r = await p.amina.post("/api/v1/conversations/direct", json={"user_id": str(p.lucas_user.id)})
    return str(r.json()["id"])


# --- sources ---------------------------------------------------------------------------


async def test_message_notifies_other_member_in_app_only(pair: Pair) -> None:
    conv = await direct(pair)
    await pair.amina.post(f"/api/v1/conversations/{conv}/messages", json={"body": "Salut Lucas"})
    data = await notifications(pair.lucas)
    assert data["unread"] == 1
    n = data["items"][0]
    assert (n["type"], n["title"], n["body"], n["link"]) == (
        "message",
        "Amina",
        "Salut Lucas",
        f"/conversations/{conv}",
    )
    assert (await notifications(pair.amina))["unread"] == 0  # not the author
    assert await outbox() == []  # messages: no email by default


async def test_task_assignment_notifies_and_emails(pair: Pair) -> None:
    task = (
        await pair.amina.post(
            "/api/v1/tasks",
            json={"title": "Valider la facture", "assignee_id": str(pair.lucas_user.id)},
        )
    ).json()
    n = (await notifications(pair.lucas))["items"][0]
    assert (n["type"], n["title"], n["link"]) == (
        "task",
        "Valider la facture",
        f"/tasks/{task['id']}",
    )
    [mail] = await outbox()
    assert mail.to_email == "lucas@example.com"
    assert mail.subject == "Tâche : Valider la facture"
    assert f"https://localhost/tasks/{task['id']}" in mail.html
    assert (
        "https://localhost/preferences" in mail.html
        and "https://localhost/preferences" in mail.text
    )
    assert "<" not in mail.text  # plain-text twin


async def test_self_assigned_task_does_not_notify(pair: Pair) -> None:
    await pair.amina.post("/api/v1/tasks", json={"title": "Pour moi"})
    assert (await notifications(pair.amina))["unread"] == 0


async def test_file_upload_notifies_members(pair: Pair) -> None:
    conv = await direct(pair)
    await pair.amina.post(
        f"/api/v1/conversations/{conv}/files", content=b"x", headers={"X-File-Name": "plan.pdf"}
    )
    n = (await notifications(pair.lucas))["items"][0]
    assert (n["type"], n["title"]) == ("file", "plan.pdf")


async def test_arabic_email_is_rtl(pair: Pair) -> None:
    await pair.lucas.patch("/api/v1/users/me", json={"locale": "ar"})
    await pair.amina.post(
        "/api/v1/tasks", json={"title": "مهمة", "assignee_id": str(pair.lucas_user.id)}
    )
    [mail] = await outbox()
    assert 'dir="rtl"' in mail.html and "text-align:right" in mail.html
    assert mail.subject.startswith("مهمة:")


# --- notifications API -----------------------------------------------------------------


async def test_mark_read_and_read_all(pair: Pair) -> None:
    conv = await direct(pair)
    for text in ("un", "deux"):
        await pair.amina.post(f"/api/v1/conversations/{conv}/messages", json={"body": text})
    items = (await notifications(pair.lucas))["items"]
    assert (
        await pair.lucas.post(f"/api/v1/notifications/{items[0]['id']}/read")
    ).status_code == 204
    assert (await notifications(pair.lucas))["unread"] == 1
    assert (await pair.lucas.post("/api/v1/notifications/read-all")).status_code == 204
    assert (await notifications(pair.lucas))["unread"] == 0


async def test_cannot_touch_others_notifications(pair: Pair) -> None:
    conv = await direct(pair)
    await pair.amina.post(f"/api/v1/conversations/{conv}/messages", json={"body": "x"})
    item = (await notifications(pair.lucas))["items"][0]
    assert (await pair.karim.post(f"/api/v1/notifications/{item['id']}/read")).status_code == 404
    assert (await pair.karim.post("/api/v1/notifications/not-a-uuid/read")).status_code == 422


async def test_notifications_require_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/notifications")).status_code == 401
    assert (await client.get("/api/v1/notifications/preferences")).status_code == 401


async def test_preferences_defaults_and_update(pair: Pair) -> None:
    prefs = {
        p["type"]: p for p in (await pair.lucas.get("/api/v1/notifications/preferences")).json()
    }
    assert prefs["message"] == {
        "type": "message",
        "in_app": True,
        "email": False,
        "email_frequency": "instant",
        "push": True,
    }
    assert prefs["task"]["email"] is True
    r = await pair.lucas.put(
        "/api/v1/notifications/preferences",
        json=[
            {"type": "task", "in_app": False, "email": False},
            {"type": "message", "in_app": True, "email": True},
        ],
    )
    assert r.status_code == 200
    await pair.amina.post(
        "/api/v1/tasks", json={"title": "T", "assignee_id": str(pair.lucas_user.id)}
    )
    assert (await notifications(pair.lucas))["unread"] == 0 and await outbox() == []
    conv = await direct(pair)
    await pair.amina.post(f"/api/v1/conversations/{conv}/messages", json={"body": "hello"})
    assert len(await outbox()) == 1


async def test_preferences_validation(pair: Pair) -> None:
    r = await pair.lucas.put(
        "/api/v1/notifications/preferences", json=[{"type": "spam", "in_app": True, "email": True}]
    )
    assert r.status_code == 422


# --- outbox ----------------------------------------------------------------------------


async def test_outbox_sends_and_retries_with_backoff(
    pair: Pair, fake_clock: FakeClock, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[str] = []
    failing = True

    async def fake_send(to: str, subject: str, html: str, text: str, config: object = None) -> None:
        if failing:
            raise ConnectionRefusedError
        sent.append(to)

    monkeypatch.setattr(email, "send_email", fake_send)
    await pair.amina.post(
        "/api/v1/tasks", json={"title": "T", "assignee_id": str(pair.lucas_user.id)}
    )

    assert await jobs.send_outbox(fake_clock()) == 0
    [mail] = await outbox()
    assert (mail.attempts, mail.status, mail.last_error) == (
        1,
        EmailStatus.PENDING,
        "ConnectionRefusedError",
    )
    assert await jobs.send_outbox(fake_clock()) == 0  # not due yet (backoff 2 min)
    assert (await outbox())[0].attempts == 1

    failing = False
    fake_clock.advance(minutes=3)
    assert await jobs.send_outbox(fake_clock()) == 1
    assert (await outbox())[0].status == EmailStatus.SENT and sent == ["lucas@example.com"]


async def test_outbox_gives_up_after_max_attempts(
    pair: Pair, fake_clock: FakeClock, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def always_fail(*_: object) -> None:
        raise TimeoutError

    monkeypatch.setattr(email, "send_email", always_fail)
    await pair.amina.post(
        "/api/v1/tasks", json={"title": "T", "assignee_id": str(pair.lucas_user.id)}
    )
    for _ in range(jobs.MAX_EMAIL_ATTEMPTS):
        await jobs.send_outbox(fake_clock())
        fake_clock.advance(hours=2)
    assert (await outbox())[0].status == EmailStatus.FAILED


async def test_requests_never_call_smtp(pair: Pair, monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(*_: object) -> None:
        raise AssertionError("SMTP called during a request")

    monkeypatch.setattr(email, "send_email", boom)
    r = await pair.amina.post(
        "/api/v1/tasks", json={"title": "T", "assignee_id": str(pair.lucas_user.id)}
    )
    assert r.status_code == 201


# --- other jobs ------------------------------------------------------------------------


async def test_overdue_nudge_once_per_day(pair: Pair, fake_clock: FakeClock) -> None:
    await pair.lucas.post("/api/v1/tasks", json={"title": "En retard", "due_date": "2026-01-04"})
    await pair.lucas.post("/api/v1/tasks", json={"title": "Pas encore", "due_date": "2026-01-30"})
    assert await jobs.nudge_overdue_tasks(fake_clock()) == 1
    assert await jobs.nudge_overdue_tasks(fake_clock()) == 0  # same day
    fake_clock.advance(days=1)
    assert await jobs.nudge_overdue_tasks(fake_clock()) == 1
    titles = [n["title"] for n in (await notifications(pair.lucas))["items"]]
    assert titles == ["En retard", "En retard"]


async def test_old_realtime_events_are_deleted(pair: Pair, fake_clock: FakeClock) -> None:
    conv = await direct(pair)
    await pair.amina.post(f"/api/v1/conversations/{conv}/messages", json={"body": "x"})
    now = datetime.now(UTC)
    assert await jobs.cleanup_realtime_events(now) == 0
    assert await jobs.cleanup_realtime_events(now + timedelta(days=8)) == 1
