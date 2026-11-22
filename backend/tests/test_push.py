"""Web push: device subscriptions, queueing from notify(), and delivery by the push job."""

import base64
import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import http_ece
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient
from pywebpush import webpush  # type: ignore[import-untyped]
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.settings import get_settings
from app.reminders import push
from app.reminders.models import PushItem, PushSubscription
from app.users import presence
from app.users.models import User
from tests.conftest import FakeClock, logged_in

FCM = "https://fcm.googleapis.com/fcm/send/"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@dataclass
class Device:
    """A browser: its key pair and auth secret, as PushManager.subscribe() creates them."""

    endpoint: str
    key: ec.EllipticCurvePrivateKey = field(
        default_factory=lambda: ec.generate_private_key(ec.SECP256R1())
    )
    auth: bytes = field(default_factory=lambda: os.urandom(16))

    def json(self) -> dict[str, Any]:
        public = self.key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        return {"endpoint": self.endpoint, "keys": {"p256dh": b64(public), "auth": b64(self.auth)}}

    def decrypt(self, body: bytes) -> dict[str, Any]:
        plain = http_ece.decrypt(
            body, private_key=self.key, auth_secret=self.auth, version="aes128gcm"
        )
        return json.loads(plain)  # type: ignore[no-any-return]


@dataclass
class Response:
    status_code: int
    text: str = ""
    reason: str = ""
    headers: dict[str, str] = field(default_factory=dict)


class PushService:
    """Stands in for FCM / Mozilla / Apple: records what the real pywebpush sends."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, bytes, dict[str, str]]] = []
        self.status: dict[str, int] = {}

    def post(self, url: str, data: bytes, headers: dict[str, str], timeout: float) -> Response:
        self.requests.append((url, data, headers))
        return Response(self.status.get(url, 201))


@pytest.fixture
def service(monkeypatch: pytest.MonkeyPatch) -> PushService:
    public, private = push.generate_vapid_keys()
    s = get_settings()
    monkeypatch.setattr(s, "vapid_public_key", public)
    monkeypatch.setattr(s, "vapid_private_key", private)
    monkeypatch.setattr(s, "vapid_subject", "mailto:admin@example.com")
    fake = PushService()
    # Real encryption and VAPID signing; only the HTTP call is replaced.
    monkeypatch.setattr(push, "send", lambda *a, **kw: webpush(*a, requests_session=fake, **kw))
    return fake


@dataclass
class Pair:
    amina: AsyncClient
    lucas: AsyncClient
    amina_user: User
    lucas_user: User


@pytest.fixture
async def pair(service: PushService) -> AsyncIterator[Pair]:
    amina, a = await logged_in("amina@example.com")
    lucas, lu = await logged_in("lucas@example.com")
    yield Pair(amina, lucas, a, lu)
    for c in (amina, lucas):
        await c.aclose()


async def subscribe(client: AsyncClient, device: Device) -> int:
    r = await client.post("/api/v1/push/subscriptions", json=device.json())
    return r.status_code


async def count(model: type[Any]) -> int:
    async with SessionLocal() as db:
        return int(await db.scalar(select(func.count()).select_from(model)) or 0)


async def assign(p: Pair, title: str = "Valider la facture") -> str:
    r = await p.amina.post(
        "/api/v1/tasks", json={"title": title, "assignee_id": str(p.lucas_user.id)}
    )
    return str(r.json()["id"])


# --- configuration and subscriptions ---------------------------------------------------


async def test_config(pair: Pair, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await pair.lucas.get("/api/v1/push/config")
    assert r.json() == {"public_key": get_settings().vapid_public_key}
    assert (await client.get("/api/v1/push/config")).status_code == 401
    monkeypatch.setattr(get_settings(), "vapid_private_key", "")
    assert (await pair.lucas.get("/api/v1/push/config")).json() == {"public_key": None}
    r = await pair.lucas.post("/api/v1/push/subscriptions", json=Device(FCM + "a").json())
    assert r.status_code == 404 and r.json()["error"]["code"] == "push_disabled"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/x",  # not HTTPS
        "https://localhost:8000/api/v1/admin",  # internal address
        "https://10.0.0.5/push",
        "https://fcm.googleapis.com.evil.example/x",  # look-alike host
        "https://evil.example/fcm.googleapis.com",
    ],
)
async def test_only_known_push_services(pair: Pair, endpoint: str) -> None:
    r = await pair.lucas.post("/api/v1/push/subscriptions", json=Device(endpoint).json())
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_endpoint"


async def test_subscription_validation(pair: Pair, client: AsyncClient) -> None:
    for body in (
        {"endpoint": FCM + "x"},
        {"endpoint": FCM + "x", "keys": {"p256dh": "a", "auth": "b"}},
    ):
        assert (await pair.lucas.post("/api/v1/push/subscriptions", json=body)).status_code == 422
    assert (
        await client.post("/api/v1/push/subscriptions", json=Device(FCM + "x").json())
    ).status_code in (401, 403)


async def test_subscribe_unsubscribe_and_device_moves_between_users(pair: Pair) -> None:
    device = Device("https://updates.push.services.mozilla.com/wpush/v2/abc")
    assert await subscribe(pair.lucas, device) == 204
    assert await subscribe(pair.lucas, device) == 204  # idempotent
    assert await count(PushSubscription) == 1
    # Someone else's DELETE does nothing.
    await pair.amina.request(
        "DELETE", "/api/v1/push/subscriptions", json={"endpoint": device.endpoint}
    )
    assert await count(PushSubscription) == 1
    # Same browser, new user (shared computer): the device follows the new user.
    assert await subscribe(pair.amina, device) == 204
    async with SessionLocal() as db:
        sub = await db.scalar(select(PushSubscription))
        assert sub is not None and sub.user_id == pair.amina_user.id
    r = await pair.amina.request(
        "DELETE", "/api/v1/push/subscriptions", json={"endpoint": device.endpoint}
    )
    assert r.status_code == 204 and await count(PushSubscription) == 0


async def test_device_limit_per_user(pair: Pair) -> None:
    for i in range(push.MAX_DEVICES + 2):
        assert await subscribe(pair.lucas, Device(f"{FCM}{i}")) == 204
    assert await count(PushSubscription) == push.MAX_DEVICES


# --- queueing --------------------------------------------------------------------------


async def test_notifications_are_queued_for_push_types_with_a_device(pair: Pair) -> None:
    await assign(pair)
    assert await count(PushItem) == 0  # no device yet
    await subscribe(pair.lucas, Device(FCM + "1"))
    await assign(pair, "Deuxième")
    assert await count(PushItem) == 1
    # Files are not pushed by default.
    r = await pair.amina.post(
        "/api/v1/conversations/direct", json={"user_id": str(pair.lucas_user.id)}
    )
    await pair.amina.post(
        f"/api/v1/conversations/{r.json()['id']}/files",
        content=b"x",
        headers={"X-File-Name": "a.pdf"},
    )
    assert await count(PushItem) == 1


async def test_push_preference(pair: Pair) -> None:
    prefs = {
        p["type"]: p for p in (await pair.lucas.get("/api/v1/notifications/preferences")).json()
    }
    assert prefs["task"]["push"] is True and prefs["file"]["push"] is False
    await subscribe(pair.lucas, Device(FCM + "1"))
    r = await pair.lucas.put(
        "/api/v1/notifications/preferences",
        json=[{"type": "task", "in_app": True, "email": False, "push": False}],
    )
    assert r.status_code == 200
    await assign(pair)
    assert await count(PushItem) == 0
    # A save without "push" keeps the current choice.
    await pair.lucas.put(
        "/api/v1/notifications/preferences", json=[{"type": "task", "in_app": True, "email": True}]
    )
    prefs = {
        p["type"]: p for p in (await pair.lucas.get("/api/v1/notifications/preferences")).json()
    }
    assert prefs["task"]["push"] is False and prefs["task"]["email"] is True


# --- delivery --------------------------------------------------------------------------


async def test_push_is_encrypted_signed_and_delivered(
    pair: Pair, service: PushService, fake_clock: FakeClock
) -> None:
    phone, laptop = Device(FCM + "phone"), Device("https://web.push.apple.com/QGx")
    await subscribe(pair.lucas, phone)
    await subscribe(pair.lucas, laptop)
    task_id = await assign(pair, "Valider la facture")
    assert await push.send_push(fake_clock()) == 2
    assert await count(PushItem) == 0
    by_url = {url: (data, headers) for url, data, headers in service.requests}
    for device in (phone, laptop):
        data, headers = by_url[device.endpoint]
        assert device.decrypt(data) == {
            "title": "Valider la facture",
            "body": "Amina",
            "link": f"/tasks/{task_id}",
            "tag": f"/tasks/{task_id}",
        }
        assert headers["Content-Encoding"] == "aes128gcm" and headers["TTL"] == str(
            push.PUSH_TTL_SECONDS
        )
        # VAPID: signed by our key, for the push service's origin.
        token, key = headers["Authorization"].removeprefix("vapid t=").split(",k=")
        assert key == get_settings().vapid_public_key
        claims = jwt.decode(token, options={"verify_signature": False})
        assert claims["sub"] == "mailto:admin@example.com"
        assert device.endpoint.startswith(claims["aud"])


async def test_no_push_while_active_in_the_app(
    pair: Pair, service: PushService, fake_clock: FakeClock
) -> None:
    await subscribe(pair.lucas, Device(FCM + "1"))
    await presence.set_status(pair.lucas_user.id, "online")
    await assign(pair)
    assert await push.send_push(fake_clock()) == 0
    assert await count(PushItem) == 0  # dropped, not delayed
    # Away (tab in the background) gets the push.
    await presence.set_status(pair.lucas_user.id, "away")
    await assign(pair, "Encore")
    assert await push.send_push(fake_clock()) == 1


async def test_stale_pushes_are_dropped(
    pair: Pair, service: PushService, fake_clock: FakeClock
) -> None:
    await subscribe(pair.lucas, Device(FCM + "1"))
    await assign(pair)
    fake_clock.advance(minutes=11)  # the job was down for a while
    assert await push.send_push(fake_clock()) == 0
    assert service.requests == []


async def test_expired_devices_are_removed_and_errors_kept(
    pair: Pair, service: PushService, fake_clock: FakeClock
) -> None:
    gone, broken, ok = Device(FCM + "gone"), Device(FCM + "broken"), Device(FCM + "ok")
    for d in (gone, broken, ok):
        await subscribe(pair.lucas, d)
    service.status = {gone.endpoint: 410, broken.endpoint: 500}
    await assign(pair)
    assert await push.send_push(fake_clock()) == 1
    async with SessionLocal() as db:
        left = set(await db.scalars(select(PushSubscription.endpoint)))
    assert left == {broken.endpoint, ok.endpoint}


async def test_network_errors_do_not_stop_the_job(
    pair: Pair,
    fake_clock: FakeClock,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await subscribe(pair.lucas, Device(FCM + "1"))
    await assign(pair, "Secret title")

    def down(*_: Any, **__: Any) -> None:
        raise ConnectionError("fcm unreachable")

    monkeypatch.setattr(push, "send", down)
    assert await push.send_push(fake_clock()) == 0
    assert await count(PushSubscription) == 1
    assert "ConnectionError" in caplog.text and "Secret title" not in caplog.text


async def test_test_push_reaches_my_devices_even_when_online(
    pair: Pair, service: PushService, fake_clock: FakeClock
) -> None:
    r = await pair.lucas.post("/api/v1/push/test")
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_device"
    device = Device(FCM + "1")
    await subscribe(pair.lucas, device)
    await presence.set_status(pair.lucas_user.id, "online")
    assert (await pair.lucas.post("/api/v1/push/test")).status_code == 202
    assert await push.send_push(fake_clock()) == 1
    assert device.decrypt(service.requests[0][1])["link"] == "/preferences"


async def test_job_does_nothing_when_push_is_off(
    pair: Pair, monkeypatch: pytest.MonkeyPatch, fake_clock: FakeClock
) -> None:
    monkeypatch.setattr(get_settings(), "vapid_public_key", "")
    assert await push.send_push(fake_clock()) == 0


def test_generated_keys_have_the_browser_format() -> None:
    public, private = push.generate_vapid_keys()
    assert len(base64.urlsafe_b64decode(public + "==")) == 65  # uncompressed P-256 point
    assert len(base64.urlsafe_b64decode(private + "=")) == 32
