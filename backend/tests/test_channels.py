import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from app.chat.mentions import mentioned_ids
from app.users.models import Role, User
from tests.conftest import logged_in


@dataclass
class Team:
    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient
    admin: AsyncClient
    amina_user: User
    lucas_user: User
    karim_user: User


@pytest.fixture
async def team() -> AsyncIterator[Team]:
    amina, a = await logged_in("amina@example.com")
    lucas, lu = await logged_in("lucas@example.com")
    karim, k = await logged_in("karim@example.com")
    admin, _ = await logged_in("root@example.com", Role.ADMIN)
    yield Team(amina, lucas, karim, admin, a, lu, k)
    for c in (amina, lucas, karim, admin):
        await c.aclose()


async def create(client: AsyncClient, **extra: Any) -> Any:
    r = await client.post("/api/v1/channels", json={"name": "general", **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def say(client: AsyncClient, channel_id: str, body: str) -> Any:
    r = await client.post(f"/api/v1/conversations/{channel_id}/messages", json={"body": body})
    assert r.status_code == 201, r.text
    return r.json()


async def notes(client: AsyncClient) -> list[Any]:
    return list((await client.get("/api/v1/notifications")).json()["items"])


# --- channels --------------------------------------------------------------------------


async def test_public_channel_browse_join_leave(team: Team) -> None:
    c = await create(team.amina, description="Tout le monde")
    assert c["joined"] is True and c["member_count"] == 1 and c["can_manage"] is True
    listed = (await team.lucas.get("/api/v1/channels")).json()
    assert [(x["name"], x["joined"]) for x in listed] == [("general", False)]
    # not a member yet: cannot read
    assert (await team.lucas.get(f"/api/v1/conversations/{c['id']}/messages")).status_code == 404
    joined = (await team.lucas.post(f"/api/v1/channels/{c['id']}/join")).json()
    assert joined["joined"] is True and joined["member_count"] == 2
    assert (await team.lucas.get(f"/api/v1/conversations/{c['id']}/messages")).status_code == 200
    left = (await team.lucas.post(f"/api/v1/channels/{c['id']}/leave")).json()
    assert left["joined"] is False
    assert (
        await team.lucas.post(f"/api/v1/conversations/{c['id']}/messages", json={"body": "x"})
    ).status_code == 404


async def test_private_channel_is_invitation_only(team: Team) -> None:
    c = await create(
        team.amina, name="direction", is_private=True, member_ids=[str(team.lucas_user.id)]
    )
    assert [x["name"] for x in (await team.lucas.get("/api/v1/channels")).json()] == ["direction"]
    assert (await team.karim.get("/api/v1/channels")).json() == []
    assert (await team.karim.get(f"/api/v1/channels/{c['id']}")).status_code == 404
    assert (await team.karim.post(f"/api/v1/channels/{c['id']}/join")).status_code == 404
    assert (
        await team.lucas.post(f"/api/v1/channels/{c['id']}/join")
    ).status_code == 403  # no self-join on private


async def test_only_creator_or_admin_manages(team: Team) -> None:
    c = await create(team.amina)
    url = f"/api/v1/channels/{c['id']}"
    await team.lucas.post(f"{url}/join")
    assert (await team.lucas.put(url, json={"name": "renamed"})).status_code == 403
    r = await team.admin.put(url, json={"name": "équipe", "member_ids": [str(team.karim_user.id)]})
    assert r.status_code == 200 and r.json()["name"] == "équipe"
    members = (await team.amina.get(f"/api/v1/conversations/{c['id']}")).json()["member_ids"]
    assert sorted(members) == sorted(
        [str(team.amina_user.id), str(team.karim_user.id)]
    )  # creator stays


async def test_channel_validation(team: Team) -> None:
    url = "/api/v1/channels"
    assert (await team.amina.post(url, json={"name": ""})).status_code == 422
    assert (await team.amina.post(url, json={"name": "#bad"})).status_code == 422
    assert (await team.amina.post(url, json={"name": "a@b"})).status_code == 422
    await create(team.amina, name="Support")
    assert (await team.lucas.post(url, json={"name": "support"})).status_code == 409  # same name


async def test_channels_require_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/channels")).status_code == 401
    assert (await client.post("/api/v1/channels", json={"name": "x"})).status_code == 401


# --- mentions --------------------------------------------------------------------------


def test_mention_parsing() -> None:
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    members = {a: "Amina Benali", b: "Amina", c: "Lucas"}
    assert mentioned_ids("Bonjour @Amina Benali, tu vois ?", members) == {a}
    assert mentioned_ids("@amina et @LUCAS", members) == {b, c}
    assert mentioned_ids("mail: x@amina.com", members) == set()
    assert mentioned_ids("Réunion @channel", members) == {a, b, c}
    assert mentioned_ids("@Lucasien", members) == set()


async def test_channel_messages_notify_only_mentions(team: Team) -> None:
    c = await create(team.amina, member_ids=[str(team.lucas_user.id), str(team.karim_user.id)])
    await say(team.amina, c["id"], "Bonjour à tous")
    assert await notes(team.lucas) == [] and await notes(team.karim) == []  # quiet channel
    await say(team.amina, c["id"], "@Lucas peux-tu regarder ?")
    [n] = await notes(team.lucas)
    assert (n["type"], n["title"], n["link"]) == (
        "mention",
        "Amina · #general",
        f"/conversations/{c['id']}",
    )
    assert await notes(team.karim) == []


async def test_at_channel_notifies_everyone_but_author(team: Team) -> None:
    c = await create(team.amina, member_ids=[str(team.lucas_user.id), str(team.karim_user.id)])
    await say(team.amina, c["id"], "Réunion à 14h @channel")
    assert [n["type"] for n in await notes(team.lucas)] == ["mention"]
    assert [n["type"] for n in await notes(team.karim)] == ["mention"]
    assert await notes(team.amina) == []


async def test_mention_of_non_member_is_ignored(team: Team) -> None:
    c = await create(team.amina, member_ids=[str(team.lucas_user.id)])
    await say(team.amina, c["id"], "@Karim tu es là ?")
    assert (
        await notes(team.karim) == []
    )  # not a member: never notified, never told about the channel


async def test_direct_chat_mention_replaces_message_notice(team: Team) -> None:
    conv = (
        await team.amina.post(
            "/api/v1/conversations/direct", json={"user_id": str(team.lucas_user.id)}
        )
    ).json()
    await say(team.amina, conv["id"], "@Lucas urgent")
    assert [n["type"] for n in await notes(team.lucas)] == ["mention"]  # one notification, not two
    await say(team.amina, conv["id"], "merci")
    assert [n["type"] for n in await notes(team.lucas)] == ["message", "mention"]


async def test_mention_email_by_default(team: Team) -> None:
    prefs = {
        p["type"]: p for p in (await team.lucas.get("/api/v1/notifications/preferences")).json()
    }
    assert prefs["mention"] == {
        "type": "mention",
        "in_app": True,
        "email": True,
        "email_frequency": "instant",
    }
