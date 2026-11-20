"""WebSocket tests use Starlette's sync TestClient (httpx has no WebSocket support)."""

import asyncio
from collections.abc import Iterator

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.users import presence
from tests.conftest import PASSWORD, make_user


def session_cookie(client: TestClient, email: str) -> str:
    client.get("/api/v1/auth/csrf")
    csrf = client.cookies["csrf_token"]
    r = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 200
    return f"session={client.cookies['session']}"


@pytest.fixture
def tc() -> Iterator[TestClient]:
    # One shared event loop for every socket opened by this client.
    with TestClient(app, base_url="https://testserver") as client:
        yield client


def test_ws_rejects_anonymous(tc: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as exc, tc.websocket_connect("/ws") as ws:
        ws.receive_json()
    assert exc.value.code == 4401


def test_ws_rejects_foreign_origin(tc: TestClient) -> None:
    asyncio.run(make_user("amina@example.com"))
    cookie = session_cookie(tc, "amina@example.com")
    headers = {"cookie": cookie, "origin": "https://evil.example"}
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        tc.websocket_connect("/ws", headers=headers) as ws,
    ):
        ws.receive_json()
    assert exc.value.code == 4403


def test_presence_online_away_offline(tc: TestClient) -> None:
    amina = asyncio.run(make_user("amina@example.com"))
    lucas = asyncio.run(make_user("lucas@example.com"))
    a_cookie = session_cookie(tc, "amina@example.com")
    l_cookie = session_cookie(TestClient(app, base_url="https://testserver"), "lucas@example.com")

    with tc.websocket_connect("/ws", headers={"cookie": a_cookie}) as a_ws:
        assert a_ws.receive_json() == {
            "type": "presence.changed",
            "user_id": str(amina.id),
            "status": "online",
        }
        with tc.websocket_connect("/ws", headers={"cookie": l_cookie}) as l_ws:
            assert a_ws.receive_json()["user_id"] == str(lucas.id)
            l_ws.receive_json()  # own online event
            l_ws.send_json({"type": "presence.set", "status": "away"})
            assert a_ws.receive_json() == {
                "type": "presence.changed",
                "user_id": str(lucas.id),
                "status": "away",
            }
            assert l_ws.receive_json()["status"] == "away"  # own event
            l_ws.send_json({"type": "presence.set", "status": "offline-hack"})
            assert l_ws.receive_json() == {"type": "error", "code": "invalid_event"}
        assert a_ws.receive_json() == {
            "type": "presence.changed",
            "user_id": str(lucas.id),
            "status": "offline",
        }
    assert presence.get(amina.id) == "offline"


def _setup_conversation(tc: TestClient) -> tuple[str, str, str, str]:
    """Amina and Lucas with a direct conversation. Returns cookies, conversation id, csrf."""
    asyncio.run(make_user("amina@example.com"))
    lucas = asyncio.run(make_user("lucas@example.com"))
    a_cookie = session_cookie(tc, "amina@example.com")
    l_cookie = session_cookie(TestClient(app, base_url="https://testserver"), "lucas@example.com")
    csrf = tc.cookies["csrf_token"]
    r = tc.post(
        "/api/v1/conversations/direct",
        json={"user_id": str(lucas.id)},
        headers={"X-CSRF-Token": csrf},
    )
    return a_cookie, l_cookie, r.json()["id"], csrf


def test_message_events_and_resume(tc: TestClient) -> None:
    a_cookie, l_cookie, conv, csrf = _setup_conversation(tc)
    url = f"/api/v1/conversations/{conv}/messages"

    with tc.websocket_connect("/ws", headers={"cookie": l_cookie}) as l_ws:
        l_ws.receive_json()  # own presence
        tc.post(url, json={"body": "un"}, headers={"X-CSRF-Token": csrf})
        event = l_ws.receive_json()
        assert event["type"] == "message.created"
        assert event["conversation_id"] == conv
        assert event["data"]["body"] == "un"
        last_id = event["id"]

    # Lucas is offline; two more messages are sent
    tc.post(url, json={"body": "deux"}, headers={"X-CSRF-Token": csrf})
    tc.post(url, json={"body": "trois"}, headers={"X-CSRF-Token": csrf})

    with tc.websocket_connect(f"/ws?last_event_id={last_id}", headers={"cookie": l_cookie}) as ws:
        replay = [ws.receive_json(), ws.receive_json()]
        assert [e["data"]["body"] for e in replay] == ["deux", "trois"]


def test_resume_never_leaks_other_conversations(tc: TestClient) -> None:
    _, _, conv, csrf = _setup_conversation(tc)
    tc.post(
        f"/api/v1/conversations/{conv}/messages",
        json={"body": "privé"},
        headers={"X-CSRF-Token": csrf},
    )
    asyncio.run(make_user("karim@example.com"))
    k_cookie = session_cookie(TestClient(app, base_url="https://testserver"), "karim@example.com")
    with tc.websocket_connect("/ws?last_event_id=0", headers={"cookie": k_cookie}) as ws:
        first = ws.receive_json()
        assert first["type"] == "presence.changed"  # no replayed message events


def test_typing_goes_to_other_members_only(tc: TestClient) -> None:
    a_cookie, l_cookie, conv, _ = _setup_conversation(tc)
    with (
        tc.websocket_connect("/ws", headers={"cookie": l_cookie}) as l_ws,
        tc.websocket_connect("/ws", headers={"cookie": a_cookie}) as a_ws,
    ):
        l_ws.receive_json()  # lucas online
        l_ws.receive_json()  # amina online
        a_ws.receive_json()  # amina online (own)
        a_ws.send_json({"type": "typing", "conversation_id": conv})
        event = l_ws.receive_json()
        assert event["type"] == "typing"
        assert event["conversation_id"] == conv


def test_typing_in_foreign_conversation_rejected(tc: TestClient) -> None:
    _, _, conv, _ = _setup_conversation(tc)
    asyncio.run(make_user("karim@example.com"))
    k_cookie = session_cookie(TestClient(app, base_url="https://testserver"), "karim@example.com")
    with tc.websocket_connect("/ws", headers={"cookie": k_cookie}) as ws:
        ws.receive_json()
        ws.send_json({"type": "typing", "conversation_id": conv})
        assert ws.receive_json() == {"type": "error", "code": "forbidden"}
