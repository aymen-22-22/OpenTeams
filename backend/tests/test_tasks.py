from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from app.users.models import Role, User
from tests.conftest import FakeClock, logged_in, make_user


@dataclass
class Team:
    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient  # employee not involved
    boss: AsyncClient  # manager: sees every board
    amina_user: User
    lucas_user: User


@pytest.fixture
async def team() -> AsyncIterator[Team]:
    amina, amina_user = await logged_in("amina@example.com")
    lucas, lucas_user = await logged_in("lucas@example.com")
    karim, _ = await logged_in("karim@example.com")
    boss, _ = await logged_in("boss@example.com", Role.MANAGER)
    yield Team(amina, lucas, karim, boss, amina_user, lucas_user)
    for c in (amina, lucas, karim, boss):
        await c.aclose()


async def create(client: AsyncClient, title: str, **extra: Any) -> Any:
    r = await client.post("/api/v1/tasks", json={"title": title, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def move(client: AsyncClient, task_id: str, status: str, after: str | None = None) -> Any:
    return await client.post(
        f"/api/v1/tasks/{task_id}/move", json={"status": status, "after_id": after}
    )


async def column(client: AsyncClient, status: str) -> list[str]:
    tasks = (await client.get("/api/v1/tasks")).json()
    return [t["title"] for t in tasks if t["status"] == status]


# --- create ----------------------------------------------------------------------------


async def test_create_task_with_its_own_chat(team: Team) -> None:
    task = await create(team.amina, "Préparer le rapport", assignee_id=str(team.lucas_user.id))
    assert task["status"] == "pending"
    assert task["assignee_id"] == str(team.lucas_user.id)
    chat = (await team.lucas.get(f"/api/v1/conversations/{task['conversation_id']}")).json()
    assert chat["type"] == "task"
    assert chat["title"] == "Préparer le rapport"
    assert sorted(chat["member_ids"]) == sorted([str(team.amina_user.id), str(team.lucas_user.id)])
    r = await team.lucas.post(
        f"/api/v1/conversations/{task['conversation_id']}/messages", json={"body": "Je m'en occupe"}
    )
    assert r.status_code == 201


async def test_create_defaults_assignee_to_me(team: Team) -> None:
    task = await create(team.amina, "Note perso")
    assert task["assignee_id"] == str(team.amina_user.id)


async def test_new_tasks_go_on_top(team: Team) -> None:
    await create(team.amina, "first")
    await create(team.amina, "second")
    assert await column(team.amina, "pending") == ["second", "first"]


async def test_create_from_message(team: Team) -> None:
    conv = await team.amina.post(
        "/api/v1/conversations/direct", json={"user_id": str(team.lucas_user.id)}
    )
    msg = await team.amina.post(
        f"/api/v1/conversations/{conv.json()['id']}/messages", json={"body": "Envoyer la facture"}
    )
    task = await create(team.lucas, "Envoyer la facture", source_message_id=msg.json()["id"])
    assert task["source_message_id"] == msg.json()["id"]
    # someone who cannot see the message cannot make a task from it
    r = await team.karim.post(
        "/api/v1/tasks", json={"title": "x", "source_message_id": msg.json()["id"]}
    )
    assert r.status_code == 404


async def test_create_validation(team: Team) -> None:
    assert (await team.amina.post("/api/v1/tasks", json={"title": ""})).status_code == 422
    r = await team.amina.post("/api/v1/tasks", json={"title": "x", "priority": "urgent"})
    assert r.status_code == 422
    gone = await make_user("gone@example.com", active=False)
    r = await team.amina.post("/api/v1/tasks", json={"title": "x", "assignee_id": str(gone.id)})
    assert r.status_code == 422


async def test_create_requires_auth(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/tasks", json={"title": "x"})).status_code == 401


# --- visibility ------------------------------------------------------------------------


async def test_visibility(team: Team) -> None:
    task = await create(team.amina, "Privé", assignee_id=str(team.lucas_user.id))
    assert [t["title"] for t in (await team.lucas.get("/api/v1/tasks")).json()] == ["Privé"]
    assert (await team.karim.get("/api/v1/tasks")).json() == []
    assert (await team.karim.get(f"/api/v1/tasks/{task['id']}")).status_code == 404
    assert (await team.boss.get(f"/api/v1/tasks/{task['id']}")).status_code == 200


async def test_person_board_and_counts(team: Team) -> None:
    lucas_id = str(team.lucas_user.id)
    a = await create(team.amina, "A", assignee_id=lucas_id)
    await create(team.amina, "B", assignee_id=lucas_id)
    await create(team.amina, "C")  # assigned to amina
    await move(team.amina, a["id"], "finished")
    board = (await team.boss.get("/api/v1/tasks", params={"assignee_id": lucas_id})).json()
    assert sorted(t["title"] for t in board) == ["A", "B"]
    counts = (await team.boss.get("/api/v1/tasks/counts", params={"assignee_id": lucas_id})).json()
    assert counts == {"pending": 1, "in_progress": 0, "finished": 1}
    # karim sees nothing of lucas' board
    assert (await team.karim.get("/api/v1/tasks", params={"assignee_id": lucas_id})).json() == []
    counts = (await team.karim.get("/api/v1/tasks/counts", params={"assignee_id": lucas_id})).json()
    assert counts == {"pending": 0, "in_progress": 0, "finished": 0}


async def test_list_validation_and_auth(team: Team, client: AsyncClient) -> None:
    assert (await team.amina.get("/api/v1/tasks", params={"assignee_id": "x"})).status_code == 422
    assert (await client.get("/api/v1/tasks")).status_code == 401
    assert (await client.get("/api/v1/tasks/counts")).status_code == 401


# --- move ------------------------------------------------------------------------------


async def test_move_between_and_within_columns(team: Team) -> None:
    a = await create(team.amina, "A")
    b = await create(team.amina, "B")
    c = await create(team.amina, "C")
    assert await column(team.amina, "pending") == ["C", "B", "A"]

    r = await move(team.amina, a["id"], "pending")  # to the top
    assert r.status_code == 200
    assert await column(team.amina, "pending") == ["A", "C", "B"]

    await move(team.amina, a["id"], "pending", after=c["id"])  # between C and B
    assert await column(team.amina, "pending") == ["C", "A", "B"]

    await move(team.amina, b["id"], "in_progress")
    await move(team.amina, c["id"], "in_progress", after=b["id"])
    assert await column(team.amina, "in_progress") == ["B", "C"]
    assert await column(team.amina, "pending") == ["A"]


async def test_finishing_sets_finished_at(team: Team, fake_clock: FakeClock) -> None:
    task = await create(team.amina, "A")
    done = (await move(team.amina, task["id"], "finished")).json()
    assert done["finished_at"].startswith("2026-01-05")
    back = (await move(team.amina, task["id"], "in_progress")).json()
    assert back["finished_at"] is None


async def test_move_validation(team: Team) -> None:
    a = await create(team.amina, "A")
    b = await create(team.amina, "B")
    assert (await move(team.amina, a["id"], "blocked")).status_code == 422
    assert (
        await move(team.amina, a["id"], "finished", after=b["id"])
    ).status_code == 422  # b not there
    assert (await move(team.amina, a["id"], "pending", after=a["id"])).status_code == 422


async def test_move_forbidden_for_outsider(team: Team) -> None:
    task = await create(team.amina, "A")
    assert (await move(team.karim, task["id"], "finished")).status_code == 404
    assert (await move(team.boss, task["id"], "finished")).status_code == 200  # manager may


# --- update / delete -------------------------------------------------------------------


async def test_update_and_reassign_adds_to_chat(team: Team) -> None:
    task = await create(team.amina, "A")
    r = await team.amina.patch(
        f"/api/v1/tasks/{task['id']}",
        json={
            "title": "A2",
            "assignee_id": str(team.lucas_user.id),
            "due_date": "2026-02-01",
            "priority": "high",
        },
    )
    assert r.status_code == 200
    assert r.json()["title"] == "A2" and r.json()["priority"] == "high"
    assert (await team.lucas.get(f"/api/v1/tasks/{task['id']}")).status_code == 200
    chat = (await team.lucas.get(f"/api/v1/conversations/{task['conversation_id']}")).json()
    assert chat["title"] == "A2"


async def test_update_validation(team: Team) -> None:
    task = await create(team.amina, "A")
    url = f"/api/v1/tasks/{task['id']}"
    assert (await team.amina.patch(url, json={"title": ""})).status_code == 422
    assert (await team.amina.patch(url, json={"assignee_id": None})).status_code == 422
    assert (await team.amina.patch(url, json={"due_date": "soon"})).status_code == 422


async def test_update_forbidden(team: Team) -> None:
    task = await create(team.amina, "A")
    r = await team.karim.patch(f"/api/v1/tasks/{task['id']}", json={"title": "hack"})
    assert r.status_code == 404


async def test_overdue(team: Team, fake_clock: FakeClock) -> None:
    task = await create(team.amina, "A", due_date="2026-01-06")
    assert task["overdue"] is False
    fake_clock.advance(days=2)
    assert (await team.amina.get(f"/api/v1/tasks/{task['id']}")).json()["overdue"] is True
    done = (await move(team.amina, task["id"], "finished")).json()
    assert done["overdue"] is False


async def test_delete_only_creator_or_admin(team: Team) -> None:
    task = await create(team.amina, "A", assignee_id=str(team.lucas_user.id))
    assert (await team.lucas.delete(f"/api/v1/tasks/{task['id']}")).status_code == 403
    assert (await team.karim.delete(f"/api/v1/tasks/{task['id']}")).status_code == 404
    assert (await team.amina.delete(f"/api/v1/tasks/{task['id']}")).status_code == 204
    assert (await team.amina.get(f"/api/v1/tasks/{task['id']}")).status_code == 404
    chat = await team.amina.get(f"/api/v1/conversations/{task['conversation_id']}")
    assert chat.status_code == 404


# --- cards: quick add and chat activity ------------------------------------------------


async def test_quick_add_straight_into_a_column(team: Team) -> None:
    await create(team.amina, "Déjà en cours", status="in_progress")
    task = await create(team.amina, "Ajoutée en cours", status="in_progress")
    assert task["status"] == "in_progress"
    assert await column(team.amina, "in_progress") == ["Ajoutée en cours", "Déjà en cours"]
    done = await create(team.amina, "Déjà faite", status="finished")
    assert done["finished_at"] is not None
    r = await team.amina.post("/api/v1/tasks", json={"title": "x", "status": "blocked"})
    assert r.status_code == 422


async def test_cards_show_message_and_file_counts(team: Team) -> None:
    task = await create(team.amina, "Avec activité", assignee_id=str(team.lucas_user.id))
    empty = await create(team.amina, "Sans activité")
    assert (task["message_count"], task["file_count"]) == (0, 0)
    conv = task["conversation_id"]
    for body in ("un", "deux", "trois"):
        r = await team.lucas.post(f"/api/v1/conversations/{conv}/messages", json={"body": body})
    await team.lucas.delete(f"/api/v1/messages/{r.json()['id']}")  # deleted ones don't count
    await team.amina.post(
        f"/api/v1/conversations/{conv}/files", content=b"x", headers={"X-File-Name": "a.pdf"}
    )
    by_id = {t["id"]: t for t in (await team.amina.get("/api/v1/tasks")).json()}
    assert (by_id[task["id"]]["message_count"], by_id[task["id"]]["file_count"]) == (2, 1)
    assert (by_id[empty["id"]]["message_count"], by_id[empty["id"]]["file_count"]) == (0, 0)
    one = (await team.amina.get(f"/api/v1/tasks/{task['id']}")).json()
    assert (one["message_count"], one["file_count"]) == (2, 1)
    # A move keeps the counts (the board updates from this response).
    moved = (await move(team.amina, task["id"], "in_progress")).json()
    assert (moved["message_count"], moved["file_count"]) == (2, 1)
