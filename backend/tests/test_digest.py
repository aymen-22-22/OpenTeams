"""Daily digest: email preferences set to "daily" collect notifications into one email."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.reminders import jobs
from app.reminders.models import DigestItem, EmailOutbox
from app.users.models import User
from tests.conftest import FakeClock, logged_in

# FakeClock starts Monday 2026-01-05 09:00 UTC = 10:00 in Europe/Paris (app TIMEZONE).
NEXT_MORNING = datetime(2026, 1, 6, 7, 0, tzinfo=UTC)  # 08:00 Paris, the default digest hour


@dataclass
class Pair:
    amina: AsyncClient
    lucas: AsyncClient
    lucas_user: User


@pytest.fixture
async def pair(fake_clock: FakeClock) -> AsyncIterator[Pair]:
    amina, _ = await logged_in("amina@example.com")
    lucas, lu = await logged_in("lucas@example.com")
    yield Pair(amina, lucas, lu)
    for c in (amina, lucas):
        await c.aclose()


async def outbox() -> list[EmailOutbox]:
    async with SessionLocal() as db:
        return list(await db.scalars(select(EmailOutbox).order_by(EmailOutbox.created_at)))


async def digest_count() -> int:
    async with SessionLocal() as db:
        return int(await db.scalar(select(func.count()).select_from(DigestItem)) or 0)


async def daily(client: AsyncClient, *types: str) -> None:
    r = await client.put(
        "/api/v1/notifications/preferences",
        json=[
            {"type": t, "in_app": True, "email": True, "email_frequency": "daily"} for t in types
        ],
    )
    assert r.status_code == 200


async def assign(p: Pair, title: str) -> str:
    r = await p.amina.post(
        "/api/v1/tasks", json={"title": title, "assignee_id": str(p.lucas_user.id)}
    )
    return str(r.json()["id"])


async def message(p: Pair, body: str) -> None:
    r = await p.amina.post("/api/v1/conversations/direct", json={"user_id": str(p.lucas_user.id)})
    await p.amina.post(f"/api/v1/conversations/{r.json()['id']}/messages", json={"body": body})


async def test_daily_preference_queues_instead_of_emailing(pair: Pair) -> None:
    await daily(pair.lucas, "task")
    prefs = {
        p["type"]: p for p in (await pair.lucas.get("/api/v1/notifications/preferences")).json()
    }
    assert prefs["task"]["email_frequency"] == "daily"
    await assign(pair, "Valider la facture")
    assert await outbox() == []
    assert await digest_count() == 1
    # In-app is unchanged.
    data = (await pair.lucas.get("/api/v1/notifications")).json()
    assert data["unread"] == 1


async def test_digest_sent_once_at_the_users_hour(pair: Pair, fake_clock: FakeClock) -> None:
    await daily(pair.lucas, "task", "message")
    task_id = await assign(pair, "Valider la facture")
    await assign(pair, "Relancer le client")
    await message(pair, "Tu as vu le devis ?")

    # Same day, after 08:00: these items arrived after today's digest time, so they wait.
    assert await jobs.send_digests(fake_clock()) == 0
    fake_clock.current = NEXT_MORNING.replace(hour=6, minute=50)  # 07:50 Paris
    assert await jobs.send_digests(fake_clock()) == 0

    fake_clock.current = NEXT_MORNING
    assert await jobs.send_digests(fake_clock()) == 1
    [mail] = await outbox()
    assert mail.to_email == "lucas@example.com"
    assert mail.subject == "Votre résumé quotidien : 3 notification(s)"
    # Grouped by type, in order of arrival, with deep links and the preferences link.
    assert mail.html.index("Tâche") < mail.html.index("Valider la facture")
    assert mail.html.index("Relancer le client") < mail.html.index("Nouveau message")
    assert f"https://localhost/tasks/{task_id}" in mail.html
    assert "Tu as vu le devis ?" in mail.text and "== Tâche ==" in mail.text
    assert "https://localhost/preferences" in mail.html
    assert "https://localhost/preferences" in mail.text
    assert "<" not in mail.text
    assert await digest_count() == 0

    # Later the same day: nothing new is sent, new items wait for tomorrow.
    await assign(pair, "Encore une")
    fake_clock.advance(hours=3)
    assert await jobs.send_digests(fake_clock()) == 0
    assert await digest_count() == 1
    fake_clock.advance(days=1)
    assert await jobs.send_digests(fake_clock()) == 1


async def test_already_read_items_are_left_out(pair: Pair, fake_clock: FakeClock) -> None:
    await daily(pair.lucas, "task")
    await assign(pair, "Déjà vue")
    await assign(pair, "Pas encore vue")
    items = (await pair.lucas.get("/api/v1/notifications")).json()["items"]
    seen = next(i for i in items if i["title"] == "Déjà vue")
    await pair.lucas.post(f"/api/v1/notifications/{seen['id']}/read")

    fake_clock.current = NEXT_MORNING
    assert await jobs.send_digests(fake_clock()) == 1
    [mail] = await outbox()
    assert "Pas encore vue" in mail.html and "Déjà vue" not in mail.html
    assert mail.subject.endswith("1 notification(s)")


async def test_no_email_when_everything_was_read(pair: Pair, fake_clock: FakeClock) -> None:
    await daily(pair.lucas, "task")
    await assign(pair, "Lue")
    await pair.lucas.post("/api/v1/notifications/read-all")
    fake_clock.current = NEXT_MORNING
    assert await jobs.send_digests(fake_clock()) == 0
    assert await outbox() == []
    assert await digest_count() == 0  # cleaned up anyway


async def test_digest_without_in_app_notification(pair: Pair, fake_clock: FakeClock) -> None:
    await pair.lucas.put(
        "/api/v1/notifications/preferences",
        json=[{"type": "task", "in_app": False, "email": True, "email_frequency": "daily"}],
    )
    await assign(pair, "Seulement par e-mail")
    assert (await pair.lucas.get("/api/v1/notifications")).json()["unread"] == 0
    fake_clock.current = NEXT_MORNING
    assert await jobs.send_digests(fake_clock()) == 1


async def test_custom_digest_hour_and_arabic(pair: Pair, fake_clock: FakeClock) -> None:
    r = await pair.lucas.patch("/api/v1/users/me", json={"digest_hour": 18, "locale": "ar"})
    assert r.status_code == 200 and r.json()["digest_hour"] == 18
    await daily(pair.lucas, "task")
    await assign(pair, "مهمة")
    fake_clock.current = datetime(2026, 1, 5, 16, 59, tzinfo=UTC)  # 17:59 Paris
    assert await jobs.send_digests(fake_clock()) == 0
    fake_clock.current = datetime(2026, 1, 5, 17, 0, tzinfo=UTC)  # 18:00 Paris, same day
    assert await jobs.send_digests(fake_clock()) == 1
    [mail] = await outbox()
    assert 'dir="rtl"' in mail.html and "text-align:right" in mail.html
    assert mail.subject.startswith("ملخصك اليومي")


async def test_many_items_are_summarised(pair: Pair, fake_clock: FakeClock) -> None:
    await daily(pair.lucas, "task")
    for i in range(12):
        await assign(pair, f"Tâche numéro {i}")
    fake_clock.current = NEXT_MORNING
    await jobs.send_digests(fake_clock())
    [mail] = await outbox()
    assert "Tâche numéro 9" in mail.html and "Tâche numéro 10" not in mail.html
    assert "et 2 autre(s)" in mail.html and "et 2 autre(s)" in mail.text


async def test_inactive_user_gets_no_digest(pair: Pair, fake_clock: FakeClock) -> None:
    await daily(pair.lucas, "task")
    await assign(pair, "T")
    async with SessionLocal() as db:
        user = await db.get(User, pair.lucas_user.id)
        assert user is not None
        user.is_active = False
        await db.commit()
    fake_clock.current = NEXT_MORNING
    assert await jobs.send_digests(fake_clock()) == 0
    assert await digest_count() == 0


async def test_digest_settings_validation(pair: Pair) -> None:
    for hour in (-1, 24, "soon"):
        r = await pair.lucas.patch("/api/v1/users/me", json={"digest_hour": hour})
        assert r.status_code == 422
    r = await pair.lucas.put(
        "/api/v1/notifications/preferences",
        json=[{"type": "task", "in_app": True, "email": True, "email_frequency": "weekly"}],
    )
    assert r.status_code == 422


async def test_preferences_are_private(pair: Pair, client: AsyncClient) -> None:
    await daily(pair.lucas, "task")
    prefs = {
        p["type"]: p for p in (await pair.amina.get("/api/v1/notifications/preferences")).json()
    }
    assert prefs["task"]["email_frequency"] == "instant"  # Lucas's choice is his own
    assert (await client.patch("/api/v1/users/me", json={"digest_hour": 9})).status_code in (
        401,
        403,
    )
