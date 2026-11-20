from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from app.users.models import User
from tests.conftest import FakeClock, logged_in, make_user


@dataclass
class Trio:
    """Amina and Lucas share a conversation; Karim is an outsider."""

    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient
    amina_user: User
    lucas_user: User
    conversation_id: str


@pytest.fixture
async def trio() -> AsyncIterator[Trio]:
    amina, amina_user = await logged_in("amina@example.com")
    lucas, lucas_user = await logged_in("lucas@example.com")
    karim, _ = await logged_in("karim@example.com")
    r = await amina.post("/api/v1/conversations/direct", json={"user_id": str(lucas_user.id)})
    yield Trio(amina, lucas, karim, amina_user, lucas_user, r.json()["id"])
    for c in (amina, lucas, karim):
        await c.aclose()


async def send(client: AsyncClient, conversation_id: str, body: str, **extra: Any) -> Any:
    r = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages", json={"body": body, **extra}
    )
    assert r.status_code == 201, r.text
    return r.json()


# --- conversations ---------------------------------------------------------------------


async def test_open_direct_is_get_or_create(trio: Trio) -> None:
    again = await trio.lucas.post(
        "/api/v1/conversations/direct", json={"user_id": str(trio.amina_user.id)}
    )
    assert again.status_code == 200
    assert again.json()["id"] == trio.conversation_id
    assert sorted(again.json()["member_ids"]) == sorted(
        [str(trio.amina_user.id), str(trio.lucas_user.id)]
    )


async def test_open_direct_with_self_rejected(trio: Trio) -> None:
    r = await trio.amina.post(
        "/api/v1/conversations/direct", json={"user_id": str(trio.amina_user.id)}
    )
    assert r.status_code == 400


async def test_open_direct_with_inactive_user(trio: Trio) -> None:
    gone = await make_user("gone@example.com", active=False)
    r = await trio.amina.post("/api/v1/conversations/direct", json={"user_id": str(gone.id)})
    assert r.status_code == 404


async def test_open_direct_validation(trio: Trio) -> None:
    r = await trio.amina.post("/api/v1/conversations/direct", json={"user_id": "nope"})
    assert r.status_code == 422


async def test_open_direct_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/api/v1/conversations/direct", json={"user_id": str(client)})
    assert r.status_code == 401


async def test_list_conversations_with_unread(trio: Trio) -> None:
    await send(trio.amina, trio.conversation_id, "Bonjour")
    await send(trio.amina, trio.conversation_id, "Ça va ?")
    lucas_view = (await trio.lucas.get("/api/v1/conversations")).json()
    assert len(lucas_view) == 1
    assert lucas_view[0]["unread_count"] == 2
    assert lucas_view[0]["last_message"]["body"] == "Ça va ?"
    amina_view = (await trio.amina.get("/api/v1/conversations")).json()
    assert amina_view[0]["unread_count"] == 0  # own messages are never unread
    assert (await trio.karim.get("/api/v1/conversations")).json() == []


async def test_get_conversation_forbidden_for_outsider(trio: Trio) -> None:
    assert (
        await trio.lucas.get(f"/api/v1/conversations/{trio.conversation_id}")
    ).status_code == 200
    r = await trio.karim.get(f"/api/v1/conversations/{trio.conversation_id}")
    assert r.status_code == 404


# --- messages --------------------------------------------------------------------------


async def test_send_and_list_messages(trio: Trio) -> None:
    first = await send(trio.amina, trio.conversation_id, "Bonjour")
    reply = await send(trio.lucas, trio.conversation_id, "Salut", reply_to_id=first["id"])
    assert reply["reply_to_id"] == first["id"]
    page = (await trio.lucas.get(f"/api/v1/conversations/{trio.conversation_id}/messages")).json()
    assert [m["body"] for m in page["items"]] == ["Bonjour", "Salut"]
    assert page["next_cursor"] is None


async def test_send_validation(trio: Trio) -> None:
    url = f"/api/v1/conversations/{trio.conversation_id}/messages"
    assert (await trio.amina.post(url, json={"body": ""})).status_code == 422
    assert (await trio.amina.post(url, json={"body": "x" * 10_001})).status_code == 422


async def test_reply_must_be_in_same_conversation(trio: Trio) -> None:
    other = await trio.amina.post(
        "/api/v1/conversations/direct",
        json={"user_id": str((await make_user("sara@example.com")).id)},
    )
    foreign = await send(trio.amina, other.json()["id"], "ailleurs")
    r = await trio.amina.post(
        f"/api/v1/conversations/{trio.conversation_id}/messages",
        json={"body": "x", "reply_to_id": foreign["id"]},
    )
    assert r.status_code == 422


async def test_outsider_cannot_read_or_send(trio: Trio) -> None:
    url = f"/api/v1/conversations/{trio.conversation_id}/messages"
    assert (await trio.karim.get(url)).status_code == 404
    assert (await trio.karim.post(url, json={"body": "intrus"})).status_code == 404


async def test_messages_require_auth(client: AsyncClient, trio: Trio) -> None:
    url = f"/api/v1/conversations/{trio.conversation_id}/messages"
    assert (await client.get(url)).status_code == 401


async def test_idempotency_key_prevents_duplicates(trio: Trio) -> None:
    url = f"/api/v1/conversations/{trio.conversation_id}/messages"
    headers = {"Idempotency-Key": "abc-123"}
    first = await trio.amina.post(url, json={"body": "une fois"}, headers=headers)
    second = await trio.amina.post(url, json={"body": "une fois"}, headers=headers)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    page = (await trio.amina.get(url)).json()
    assert len(page["items"]) == 1


async def test_cursor_pagination(trio: Trio) -> None:
    for i in range(5):
        await send(trio.amina, trio.conversation_id, f"m{i}")
    url = f"/api/v1/conversations/{trio.conversation_id}/messages"
    page1 = (await trio.amina.get(url, params={"limit": 2})).json()
    assert [m["body"] for m in page1["items"]] == ["m3", "m4"]
    page2 = (await trio.amina.get(url, params={"limit": 2, "before": page1["next_cursor"]})).json()
    assert [m["body"] for m in page2["items"]] == ["m1", "m2"]
    page3 = (await trio.amina.get(url, params={"limit": 2, "before": page2["next_cursor"]})).json()
    assert [m["body"] for m in page3["items"]] == ["m0"]
    assert page3["next_cursor"] is None


async def test_pagination_validation(trio: Trio) -> None:
    url = f"/api/v1/conversations/{trio.conversation_id}/messages"
    assert (await trio.amina.get(url, params={"limit": 500})).status_code == 422


async def test_edit_own_message(trio: Trio, fake_clock: FakeClock) -> None:
    m = await send(trio.amina, trio.conversation_id, "typo")
    r = await trio.amina.patch(f"/api/v1/messages/{m['id']}", json={"body": "fixed"})
    assert r.status_code == 200
    assert r.json()["body"] == "fixed"
    assert r.json()["edited_at"].startswith("2026-01-05")


async def test_cannot_edit_others_message(trio: Trio) -> None:
    m = await send(trio.amina, trio.conversation_id, "mine")
    r = await trio.lucas.patch(f"/api/v1/messages/{m['id']}", json={"body": "hacked"})
    assert r.status_code == 403
    r = await trio.karim.patch(f"/api/v1/messages/{m['id']}", json={"body": "hacked"})
    assert r.status_code == 404


async def test_edit_validation(trio: Trio) -> None:
    m = await send(trio.amina, trio.conversation_id, "x")
    assert (
        await trio.amina.patch(f"/api/v1/messages/{m['id']}", json={"body": ""})
    ).status_code == 422


async def test_delete_own_message_hides_content(trio: Trio) -> None:
    m = await send(trio.amina, trio.conversation_id, "secret")
    assert (await trio.lucas.delete(f"/api/v1/messages/{m['id']}")).status_code == 403
    assert (await trio.amina.delete(f"/api/v1/messages/{m['id']}")).status_code == 204
    page = (await trio.lucas.get(f"/api/v1/conversations/{trio.conversation_id}/messages")).json()
    assert page["items"][0]["deleted"] is True
    assert page["items"][0]["body"] == ""
    assert (await trio.amina.delete(f"/api/v1/messages/{m['id']}")).status_code == 409


# --- read state ------------------------------------------------------------------------


async def test_mark_read(trio: Trio) -> None:
    m = await send(trio.amina, trio.conversation_id, "lis-moi")
    url = f"/api/v1/conversations/{trio.conversation_id}/read"
    assert (await trio.lucas.post(url, json={"seq": m["seq"]})).status_code == 204
    view = (await trio.lucas.get(f"/api/v1/conversations/{trio.conversation_id}")).json()
    assert view["unread_count"] == 0
    assert view["last_read_seq"] == m["seq"]
    # going backwards is ignored
    assert (await trio.lucas.post(url, json={"seq": 0})).status_code == 204
    view = (await trio.lucas.get(f"/api/v1/conversations/{trio.conversation_id}")).json()
    assert view["last_read_seq"] == m["seq"]


async def test_mark_read_validation_and_access(trio: Trio) -> None:
    url = f"/api/v1/conversations/{trio.conversation_id}/read"
    assert (await trio.lucas.post(url, json={"seq": -1})).status_code == 422
    assert (await trio.karim.post(url, json={"seq": 1})).status_code == 404


# --- pins ------------------------------------------------------------------------------


async def test_pin_and_unpin(trio: Trio) -> None:
    m = await send(trio.amina, trio.conversation_id, "important")
    pins_url = f"/api/v1/conversations/{trio.conversation_id}/pins"
    assert (await trio.lucas.post(f"/api/v1/messages/{m['id']}/pin")).status_code == 204
    assert (
        await trio.lucas.post(f"/api/v1/messages/{m['id']}/pin")
    ).status_code == 204  # idempotent
    pins = (await trio.amina.get(pins_url)).json()
    assert [p["message"]["body"] for p in pins] == ["important"]
    assert pins[0]["pinned_by"] == str(trio.lucas_user.id)
    assert (await trio.amina.delete(f"/api/v1/messages/{m['id']}/pin")).status_code == 204
    assert (await trio.amina.get(pins_url)).json() == []
    assert (await trio.amina.delete(f"/api/v1/messages/{m['id']}/pin")).status_code == 404


async def test_pins_forbidden_for_outsider(trio: Trio) -> None:
    m = await send(trio.amina, trio.conversation_id, "important")
    assert (await trio.karim.post(f"/api/v1/messages/{m['id']}/pin")).status_code == 404
    pins_url = f"/api/v1/conversations/{trio.conversation_id}/pins"
    assert (await trio.karim.get(pins_url)).status_code == 404


async def test_pin_validation(trio: Trio) -> None:
    assert (await trio.amina.post("/api/v1/messages/not-a-uuid/pin")).status_code == 422


# --- search ----------------------------------------------------------------------------


async def test_search_only_my_conversations(trio: Trio) -> None:
    await send(trio.amina, trio.conversation_id, "Le rapport mensuel est prêt")
    await send(trio.amina, trio.conversation_id, "Autre chose")
    sara = await make_user("sara@example.com")
    other = await trio.karim.post("/api/v1/conversations/direct", json={"user_id": str(sara.id)})
    await send(trio.karim, other.json()["id"], "rapport confidentiel")

    found = (await trio.lucas.get("/api/v1/search", params={"q": "rapport"})).json()
    assert [m["body"] for m in found["messages"]] == ["Le rapport mensuel est prêt"]
    arabic = await send(trio.lucas, trio.conversation_id, "التقرير الشهري جاهز")
    found = (await trio.amina.get("/api/v1/search", params={"q": "التقرير"})).json()
    assert [m["id"] for m in found["messages"]] == [arabic["id"]]


async def test_search_excludes_deleted(trio: Trio) -> None:
    m = await send(trio.amina, trio.conversation_id, "budget secret")
    await trio.amina.delete(f"/api/v1/messages/{m['id']}")
    found = (await trio.amina.get("/api/v1/search", params={"q": "budget"})).json()
    assert found["messages"] == []


async def test_search_validation(trio: Trio) -> None:
    assert (await trio.amina.get("/api/v1/search", params={"q": "a"})).status_code == 422


async def test_search_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/search", params={"q": "rapport"})).status_code == 401
