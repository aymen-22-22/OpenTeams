"""WebSocket tests use Starlette's sync TestClient (httpx has no WebSocket support)."""

import asyncio

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
def tc() -> TestClient:
    return TestClient(app, base_url="https://testserver")


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
