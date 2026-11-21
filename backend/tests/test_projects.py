from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from app.users.models import Role, User
from tests.conftest import FakeClock, logged_in


@dataclass
class Team:
    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient  # not a member
    boss: AsyncClient  # manager
    amina_user: User
    lucas_user: User


@pytest.fixture
async def team() -> AsyncIterator[Team]:
    amina, a = await logged_in("amina@example.com")
    lucas, lu = await logged_in("lucas@example.com")
    karim, _ = await logged_in("karim@example.com")
    boss, _ = await logged_in("boss@example.com", Role.MANAGER)
    yield Team(amina, lucas, karim, boss, a, lu)
    for c in (amina, lucas, karim, boss):
        await c.aclose()


async def create(client: AsyncClient, **extra: Any) -> Any:
    r = await client.post("/api/v1/projects", json={"name": "Site web", **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_and_visibility(team: Team) -> None:
    p = await create(team.amina, member_ids=[str(team.lucas_user.id)])
    assert sorted(p["member_ids"]) == sorted([str(team.amina_user.id), str(team.lucas_user.id)])
    assert p["can_edit"] is True
    assert [x["name"] for x in (await team.lucas.get("/api/v1/projects")).json()] == ["Site web"]
    assert (await team.karim.get("/api/v1/projects")).json() == []
    assert (await team.karim.get(f"/api/v1/projects/{p['id']}")).status_code == 404
    boss_view = (await team.boss.get(f"/api/v1/projects/{p['id']}")).json()
    assert boss_view["can_edit"] is True  # manager view


async def test_validation(team: Team) -> None:
    url = "/api/v1/projects"
    assert (await team.amina.post(url, json={"name": ""})).status_code == 422
    assert (await team.amina.post(url, json={"name": "x", "status": "dreaming"})).status_code == 422
    r = await team.amina.post(
        url, json={"name": "x", "member_ids": ["00000000-0000-0000-0000-000000000000"]}
    )
    assert r.status_code == 422


async def test_only_owner_or_manager_edits(team: Team) -> None:
    p = await create(team.amina, member_ids=[str(team.lucas_user.id)])
    url = f"/api/v1/projects/{p['id']}"
    assert (await team.lucas.put(url, json={"name": "x"})).status_code == 403  # member, not owner
    assert (await team.karim.put(url, json={"name": "x"})).status_code == 404
    r = await team.boss.put(
        url, json={"name": "Site web v2", "member_ids": [str(team.lucas_user.id)]}
    )
    assert r.status_code == 200 and r.json()["name"] == "Site web v2"
    assert str(team.amina_user.id) in r.json()["member_ids"]  # the owner always stays a member
    assert (await team.lucas.delete(url)).status_code == 403
    assert (await team.amina.delete(url)).status_code == 204


async def test_project_tasks_counts_and_files(team: Team) -> None:
    p = await create(team.amina, member_ids=[str(team.lucas_user.id)])
    t = (
        await team.amina.post(
            "/api/v1/tasks",
            json={
                "title": "Maquette",
                "project_id": p["id"],
                "assignee_id": str(team.lucas_user.id),
            },
        )
    ).json()
    await team.amina.post(
        f"/api/v1/conversations/{t['conversation_id']}/files",
        content=b"x",
        headers={"X-File-Name": "maquette.png"},
    )
    detail = (await team.lucas.get(f"/api/v1/projects/{p['id']}")).json()
    assert [x["title"] for x in detail["tasks"]] == ["Maquette"]
    assert detail["counts"] == {"pending": 1, "in_progress": 0, "finished": 0}
    assert [f["name"] for f in detail["files"]] == ["maquette.png"]
    # a member who is not in the task chat does not see its files (nor the task)
    await team.amina.put(
        f"/api/v1/projects/{p['id']}",
        json={
            "name": "Site web",
            "member_ids": [
                str(team.lucas_user.id),
                str((await team.karim.get("/api/v1/users/me")).json()["id"]),
            ],
        },
    )
    karim_view = (await team.karim.get(f"/api/v1/projects/{p['id']}")).json()
    assert karim_view["tasks"] == [] and karim_view["files"] == []


async def test_task_project_must_be_visible(team: Team) -> None:
    p = await create(team.amina)
    r = await team.karim.post("/api/v1/tasks", json={"title": "x", "project_id": p["id"]})
    assert r.status_code == 404


async def test_milestones_and_calendar(team: Team, fake_clock: FakeClock) -> None:
    p = await create(team.amina, member_ids=[str(team.lucas_user.id)])
    m = await team.amina.post(
        f"/api/v1/projects/{p['id']}/milestones", json={"title": "Bêta", "date": "2026-01-20"}
    )
    assert m.status_code == 201
    assert (
        await team.lucas.post(
            f"/api/v1/projects/{p['id']}/milestones", json={"title": "x", "date": "2026-01-21"}
        )
    ).status_code == 403
    assert (
        await team.amina.put(
            f"/api/v1/projects/milestones/{m.json()['id']}",
            json={"title": "Bêta", "date": "2026-01-20", "done": True},
        )
    ).json()["done"] is True
    await team.amina.put(
        f"/api/v1/projects/{p['id']}",
        json={"name": "Site web", "status": "finished", "member_ids": [str(team.lucas_user.id)]},
    )
    rng = {"start": "2026-01-01T00:00:00Z", "end": "2026-02-01T00:00:00Z"}
    events = {
        e["type"]: e for e in (await team.lucas.get("/api/v1/calendar/events", params=rng)).json()
    }
    assert events["milestone"]["title"] == "Site web — Bêta"
    assert events["project_finished"]["title"] == "Site web"
    assert (await team.karim.get("/api/v1/calendar/events", params=rng)).json() == []


async def test_projects_require_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/projects")).status_code == 401
    assert (await client.post("/api/v1/projects", json={"name": "x"})).status_code == 401


async def test_search_finds_tasks_and_projects(team: Team) -> None:
    p = await create(team.amina)
    await team.amina.post("/api/v1/tasks", json={"title": "Refonte du site", "project_id": p["id"]})
    found = (await team.amina.get("/api/v1/search", params={"q": "site"})).json()
    assert [x["title"] for x in found["tasks"]] == ["Refonte du site"]
    assert [x["title"] for x in found["projects"]] == ["Site web"]
    assert (await team.karim.get("/api/v1/search", params={"q": "site"})).json()["projects"] == []


async def test_weekly_report_has_project_section(team: Team) -> None:
    p = await create(team.boss, name="Migration")
    await team.boss.post("/api/v1/tasks", json={"title": "Export", "project_id": p["id"]})
    pb = (
        await team.boss.post("/api/v1/playbooks", json={"name": "Hebdo", "kind": "weekly_report"})
    ).json()
    run = (await team.boss.post(f"/api/v1/playbooks/{pb['id']}/run")).json()
    report = (await team.boss.get(f"/api/v1/playbooks/runs/{run['id']}")).json()
    text = next(iter(report["reports"].values()))
    assert "Par projet" in text and "- Migration: Terminées 0, En cours 0, En retard 0" in text
