from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.admin.models import AuditLog
from app.core.db import SessionLocal
from app.main import app
from tests.conftest import PASSWORD, FakeClock, login, make_user

LOGIN = "/api/v1/auth/login"


async def test_login_sets_secure_session_cookie(client: AsyncClient) -> None:
    await make_user("amina@example.com")
    r = await client.post(LOGIN, json={"email": "AMINA@example.com", "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["email"] == "amina@example.com"
    assert "password_hash" not in r.json()
    cookie = r.headers.get_list("set-cookie")
    session_cookie = next(c for c in cookie if c.startswith("session="))
    assert "HttpOnly" in session_cookie
    assert "Secure" in session_cookie
    assert "SameSite=lax" in session_cookie


async def test_login_wrong_password(client: AsyncClient) -> None:
    await make_user("amina@example.com")
    r = await client.post(LOGIN, json={"email": "amina@example.com", "password": "nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"


async def test_login_unknown_email_same_error(client: AsyncClient) -> None:
    r = await client.post(LOGIN, json={"email": "ghost@example.com", "password": "x"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"


async def test_login_inactive_user_rejected(client: AsyncClient) -> None:
    await make_user("old@example.com", active=False)
    r = await client.post(LOGIN, json={"email": "old@example.com", "password": PASSWORD})
    assert r.status_code == 401


async def test_login_validation_error(client: AsyncClient) -> None:
    r = await client.post(LOGIN, json={"email": "not-an-email"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_login_requires_csrf_token() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as c:
        r = await c.post(LOGIN, json={"email": "a@example.com", "password": "x"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"


async def test_login_rate_limited(client: AsyncClient, fake_clock: FakeClock) -> None:
    await make_user("amina@example.com")
    bad = {"email": "amina@example.com", "password": "wrong"}
    for _ in range(5):
        assert (await client.post(LOGIN, json=bad)).status_code == 401
    assert (await client.post(LOGIN, json=bad)).status_code == 429
    fake_clock.advance(minutes=6)
    assert (await client.post(LOGIN, json=bad)).status_code == 401


async def test_login_is_audited(client: AsyncClient) -> None:
    user = await make_user("amina@example.com")
    await login(client, "amina@example.com")
    async with SessionLocal() as db:
        actions = (
            await db.scalars(select(AuditLog.action).where(AuditLog.actor_id == user.id))
        ).all()
    assert actions == ["auth.login"]


async def test_logout_revokes_session(employee_client: AsyncClient) -> None:
    token = employee_client.cookies["session"]
    assert (await employee_client.post("/api/v1/auth/logout")).status_code == 204
    employee_client.cookies.set("session", token, domain="test")  # replay the old cookie
    assert (await employee_client.get("/api/v1/users/me")).status_code == 401


async def test_session_expires(client: AsyncClient, fake_clock: FakeClock) -> None:
    await make_user("amina@example.com")
    await login(client, "amina@example.com")
    assert (await client.get("/api/v1/users/me")).status_code == 200
    fake_clock.advance(days=8)
    assert (await client.get("/api/v1/users/me")).status_code == 401


async def test_forged_token_rejected(client: AsyncClient) -> None:
    client.cookies.set("session", "not.a.jwt", domain="test")
    assert (await client.get("/api/v1/users/me")).status_code == 401
