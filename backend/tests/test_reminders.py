from datetime import UTC, datetime

from httpx import AsyncClient

from app.reminders import jobs
from app.reminders.models import Recurrence
from tests.conftest import FakeClock, logged_in

AT = "2026-01-05T10:00:00+00:00"  # one hour after the fake clock


async def test_create_list_update_delete(employee_client: AsyncClient) -> None:
    r = await employee_client.post(
        "/api/v1/reminders", json={"title": "Appeler le client", "remind_at": AT}
    )
    assert r.status_code == 201
    rid = r.json()["id"]
    assert [x["title"] for x in (await employee_client.get("/api/v1/reminders")).json()] == [
        "Appeler le client"
    ]
    r = await employee_client.patch(f"/api/v1/reminders/{rid}", json={"recurrence": "weekly"})
    assert r.json()["recurrence"] == "weekly"
    assert (await employee_client.delete(f"/api/v1/reminders/{rid}")).status_code == 204
    assert (await employee_client.get("/api/v1/reminders")).json() == []


async def test_reminder_validation(employee_client: AsyncClient) -> None:
    url = "/api/v1/reminders"
    assert (await employee_client.post(url, json={"title": "", "remind_at": AT})).status_code == 422
    assert (
        await employee_client.post(url, json={"title": "x", "remind_at": "2026-01-05T10:00:00"})
    ).status_code == 422
    assert (
        await employee_client.post(
            url, json={"title": "x", "remind_at": AT, "recurrence": "hourly"}
        )
    ).status_code == 422
    r = await employee_client.post(url, json={"title": "x", "remind_at": AT, "target_type": "task"})
    assert r.status_code == 422  # target_id missing


async def test_reminders_are_private(employee_client: AsyncClient) -> None:
    rid = (
        await employee_client.post("/api/v1/reminders", json={"title": "x", "remind_at": AT})
    ).json()["id"]
    other, _ = await logged_in("karim@example.com")
    assert (await other.get("/api/v1/reminders")).json() == []
    assert (await other.patch(f"/api/v1/reminders/{rid}", json={"title": "y"})).status_code == 404
    assert (await other.delete(f"/api/v1/reminders/{rid}")).status_code == 404


async def test_reminders_require_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/reminders")).status_code == 401
    assert (
        await client.post("/api/v1/reminders", json={"title": "x", "remind_at": AT})
    ).status_code == 401


async def test_target_must_be_visible(employee_client: AsyncClient) -> None:
    other, _ = await logged_in("karim@example.com")
    task = (await other.post("/api/v1/tasks", json={"title": "Privé"})).json()
    r = await employee_client.post(
        "/api/v1/reminders",
        json={"title": "x", "remind_at": AT, "target_type": "task", "target_id": task["id"]},
    )
    assert r.status_code == 404
    r = await other.post(
        "/api/v1/reminders",
        json={"title": "x", "remind_at": AT, "target_type": "task", "target_id": task["id"]},
    )
    assert r.status_code == 201


async def test_due_reminder_notifies_with_link(
    employee_client: AsyncClient, fake_clock: FakeClock
) -> None:
    task = (await employee_client.post("/api/v1/tasks", json={"title": "Rapport"})).json()
    await employee_client.post(
        "/api/v1/reminders",
        json={
            "title": "Finir le rapport",
            "remind_at": AT,
            "target_type": "task",
            "target_id": task["id"],
        },
    )
    assert await jobs.process_due_reminders(fake_clock()) == 0  # not yet
    fake_clock.advance(hours=1)
    assert await jobs.process_due_reminders(fake_clock()) == 1
    n = (await employee_client.get("/api/v1/notifications")).json()["items"][0]
    assert (n["type"], n["title"], n["link"]) == (
        "reminder",
        "Finir le rapport",
        f"/tasks/{task['id']}",
    )
    assert (await employee_client.get("/api/v1/reminders")).json() == []  # one-time: done
    assert await jobs.process_due_reminders(fake_clock()) == 0


async def test_recurring_reminder_moves_forward(
    employee_client: AsyncClient, fake_clock: FakeClock
) -> None:
    await employee_client.post(
        "/api/v1/reminders", json={"title": "Stand-up", "remind_at": AT, "recurrence": "daily"}
    )
    fake_clock.advance(
        days=3
    )  # missed a few while offline: one notification, next one in the future
    assert await jobs.process_due_reminders(fake_clock()) == 1
    [r] = (await employee_client.get("/api/v1/reminders")).json()
    assert r["remind_at"].startswith("2026-01-08T10:00")  # next one still ahead (now: Jan 8 09:00)


def test_next_occurrence_monthly_clamps_day() -> None:
    jan31 = datetime(2026, 1, 31, 9, tzinfo=UTC)
    assert jobs.next_occurrence(jan31, Recurrence.MONTHLY) == datetime(2026, 2, 28, 9, tzinfo=UTC)
    dec = datetime(2026, 12, 15, 9, tzinfo=UTC)
    assert jobs.next_occurrence(dec, Recurrence.MONTHLY) == datetime(2027, 1, 15, 9, tzinfo=UTC)
