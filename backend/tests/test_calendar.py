from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from app.users.models import Role, User
from tests.conftest import FakeClock, logged_in

RANGE = {"start": "2026-01-01T00:00:00+01:00", "end": "2026-02-01T00:00:00+01:00"}
MEETING = {
    "title": "Point projet",
    "starts_at": "2026-01-07T10:00:00+01:00",
    "ends_at": "2026-01-07T11:00:00+01:00",
}


@dataclass
class People:
    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient
    boss: AsyncClient  # manager
    amina_user: User
    lucas_user: User


@pytest.fixture
async def people() -> AsyncIterator[People]:
    amina, a = await logged_in("amina@example.com")
    lucas, lu = await logged_in("lucas@example.com")
    karim, _ = await logged_in("karim@example.com")
    boss, _ = await logged_in("boss@example.com", Role.MANAGER)
    yield People(amina, lucas, karim, boss, a, lu)
    for c in (amina, lucas, karim, boss):
        await c.aclose()


async def events(client: AsyncClient, **params: str) -> list[Any]:
    r = await client.get("/api/v1/calendar/events", params={**RANGE, **params})
    assert r.status_code == 200, r.text
    return list(r.json())


async def meeting(client: AsyncClient, **extra: Any) -> Any:
    r = await client.post("/api/v1/calendar/events", json={**MEETING, **extra})
    assert r.status_code == 201, r.text
    return r.json()


# --- meetings --------------------------------------------------------------------------


async def test_meeting_visible_to_attendees_only(people: People) -> None:
    m = await meeting(people.amina, attendee_ids=[str(people.lucas_user.id)])
    assert m["type"] == "meeting"
    assert sorted(m["user_ids"]) == sorted([str(people.amina_user.id), str(people.lucas_user.id)])
    assert [e["title"] for e in await events(people.lucas)] == ["Point projet"]
    assert await events(people.karim) == []
    assert await events(people.boss) == []  # meetings stay private, even for managers


async def test_invited_people_are_notified(people: People) -> None:
    await meeting(people.amina, attendee_ids=[str(people.lucas_user.id)])
    n = (await people.lucas.get("/api/v1/notifications")).json()["items"][0]
    assert (n["type"], n["title"], n["link"]) == ("event", "Point projet", "/calendar")
    assert (await people.amina.get("/api/v1/notifications")).json()["unread"] == 0


async def test_meeting_from_chat_invites_members(people: People) -> None:
    conv = (
        await people.amina.post(
            "/api/v1/conversations/direct", json={"user_id": str(people.lucas_user.id)}
        )
    ).json()
    m = await meeting(people.amina, conversation_id=conv["id"])
    assert str(people.lucas_user.id) in m["user_ids"]
    r = await people.karim.post(
        "/api/v1/calendar/events", json={**MEETING, "conversation_id": conv["id"]}
    )
    assert r.status_code == 404  # not a member of that chat


async def test_meeting_validation(people: People) -> None:
    url = "/api/v1/calendar/events"
    assert (await people.amina.post(url, json={**MEETING, "title": ""})).status_code == 422
    bad_range = {**MEETING, "ends_at": "2026-01-07T09:00:00+01:00"}
    assert (await people.amina.post(url, json=bad_range)).status_code == 422
    naive = {**MEETING, "starts_at": "2026-01-07T10:00:00"}
    assert (await people.amina.post(url, json=naive)).status_code == 422
    unknown = {**MEETING, "attendee_ids": ["00000000-0000-0000-0000-000000000000"]}
    assert (await people.amina.post(url, json=unknown)).status_code == 422


async def test_only_organizer_edits_or_deletes(people: People) -> None:
    m = await meeting(people.amina, attendee_ids=[str(people.lucas_user.id)])
    url = f"/api/v1/calendar/events/{m['id']}"
    assert (await people.lucas.put(url, json={**MEETING, "title": "x"})).status_code == 403
    assert (await people.karim.put(url, json={**MEETING, "title": "x"})).status_code == 404
    assert (await people.lucas.delete(url)).status_code == 403
    r = await people.amina.put(
        url, json={**MEETING, "title": "Point projet (déplacé)", "attendee_ids": []}
    )
    assert r.status_code == 200 and r.json()["user_ids"] == [str(people.amina_user.id)]
    assert await events(people.lucas) == []  # removed from the meeting
    assert (await people.amina.delete(url)).status_code == 204
    assert await events(people.amina) == []


async def test_calendar_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/calendar/events", params=RANGE)).status_code == 401
    assert (await client.post("/api/v1/calendar/events", json=MEETING)).status_code == 401


async def test_range_validation(people: People) -> None:
    url = "/api/v1/calendar/events"
    too_long = {"start": "2026-01-01T00:00:00Z", "end": "2026-06-01T00:00:00Z"}
    assert (await people.amina.get(url, params=too_long)).status_code == 422
    backwards = {"start": "2026-02-01T00:00:00Z", "end": "2026-01-01T00:00:00Z"}
    assert (await people.amina.get(url, params=backwards)).status_code == 422
    naive = {"start": "2026-01-01T00:00:00", "end": "2026-01-02T00:00:00"}
    assert (await people.amina.get(url, params=naive)).status_code == 422


# --- automatic events from tasks -------------------------------------------------------


async def test_task_due_and_finished_events(people: People, fake_clock: FakeClock) -> None:
    t = (
        await people.amina.post(
            "/api/v1/tasks", json={"title": "Facture", "due_date": "2026-01-15"}
        )
    ).json()
    await people.amina.post(f"/api/v1/tasks/{t['id']}/move", json={"status": "finished"})
    evs = {e["type"]: e for e in await events(people.amina)}
    assert evs["task_due"]["title"] == "Facture" and evs["task_due"]["all_day"] is True
    assert evs["task_due"]["starts_at"].startswith("2026-01-15")
    assert evs["task_due"]["task_id"] == t["id"]
    assert evs["task_finished"]["starts_at"].startswith("2026-01-05")  # finished "now" (fake clock)


async def test_task_events_follow_task_visibility(people: People) -> None:
    await people.amina.post("/api/v1/tasks", json={"title": "Privée", "due_date": "2026-01-15"})
    assert await events(people.karim) == []
    assert [e["title"] for e in await events(people.boss)] == ["Privée"]  # manager view


async def test_filter_by_person_and_team(people: People, admin_client: AsyncClient) -> None:
    lucas_id = str(people.lucas_user.id)
    await people.boss.post(
        "/api/v1/tasks",
        json={"title": "Pour Lucas", "assignee_id": lucas_id, "due_date": "2026-01-10"},
    )
    await people.boss.post("/api/v1/tasks", json={"title": "Pour moi", "due_date": "2026-01-11"})
    assert [e["title"] for e in await events(people.boss, user_id=lucas_id)] == ["Pour Lucas"]
    team = (await admin_client.post("/api/v1/admin/teams", json={"name": "Dev"})).json()
    await admin_client.post(f"/api/v1/admin/teams/{team['id']}/members", json={"user_id": lucas_id})
    assert [e["title"] for e in await events(people.boss, team_id=team["id"])] == ["Pour Lucas"]


# --- iCal feed -------------------------------------------------------------------------


async def test_ical_feed(people: People, client: AsyncClient, fake_clock: FakeClock) -> None:
    await meeting(people.amina, title="Réunion, budget; 2026")
    await people.amina.post("/api/v1/tasks", json={"title": "Facture", "due_date": "2026-01-15"})
    url = (await people.amina.post("/api/v1/calendar/feed")).json()["url"]
    assert url.startswith("https://localhost/api/v1/calendar/feed/")
    r = await client.get(url.replace("https://localhost", ""))  # no session cookie needed
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    body = r.text
    assert body.startswith("BEGIN:VCALENDAR\r\n") and body.endswith("END:VCALENDAR\r\n")
    assert r"SUMMARY:Réunion\, budget\; 2026" in body
    assert "DTSTART:20260107T090000Z" in body  # 10:00 Paris
    assert "DTSTART;VALUE=DATE:20260115" in body and "DTEND;VALUE=DATE:20260116" in body


async def test_ical_link_rotation_and_bad_tokens(people: People, client: AsyncClient) -> None:
    old = (
        (await people.amina.post("/api/v1/calendar/feed"))
        .json()["url"]
        .replace("https://localhost", "")
    )
    new = (
        (await people.amina.post("/api/v1/calendar/feed"))
        .json()["url"]
        .replace("https://localhost", "")
    )
    assert (await client.get(old)).status_code == 404  # old link stops working
    assert (await client.get(new)).status_code == 200
    assert (await client.get("/api/v1/calendar/feed/guess.ics")).status_code == 404


async def test_feed_requires_auth_to_create(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/calendar/feed")).status_code == 401


# --- reminders on events ---------------------------------------------------------------


async def test_reminder_on_event_needs_visibility(people: People) -> None:
    m = await meeting(people.amina)
    body = {
        "title": "Préparer",
        "remind_at": "2026-01-07T09:00:00+01:00",
        "target_type": "event",
        "target_id": m["id"],
    }
    assert (await people.amina.post("/api/v1/reminders", json=body)).status_code == 201
    assert (await people.karim.post("/api/v1/reminders", json=body)).status_code == 404
