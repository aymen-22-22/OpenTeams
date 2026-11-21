import logging

import pytest
from httpx import AsyncClient

from tests.conftest import PASSWORD, logged_in, login, new_client


async def test_security_headers_on_api_responses(client: AsyncClient) -> None:
    r = await client.get("/api/v1/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert r.headers["referrer-policy"] == "same-origin"


async def test_headers_also_on_errors(client: AsyncClient) -> None:
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401 and r.headers["x-frame-options"] == "DENY"


async def test_logs_never_contain_tokens(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="openteams.http")
    await client.get("/api/v1/calendar/feed/super-secret-token.ics")
    await client.get("/api/v1/files/download?token=another-secret")
    text = "\n".join(r.getMessage() for r in caplog.records if r.name == "openteams.http")
    assert "super-secret-token" not in text and "another-secret" not in text
    assert "GET /api/v1/calendar/feed/{token}.ics 404" in text
    assert "GET /api/v1/files/download 403" in text


async def test_metrics_endpoint(client: AsyncClient) -> None:
    await client.get("/api/v1/health")
    r = await client.get("/metrics")
    assert r.status_code == 200
    body = r.text
    assert 'openteams_http_requests_total{method="GET",route="/api/v1/health",status="200"}' in body
    assert "openteams_email_outbox_pending 0.0" in body
    assert "openteams_websocket_users 0.0" in body


async def test_change_password_signs_out_other_sessions() -> None:
    first, _ = await logged_in("amina@example.com")
    second = await new_client()
    await login(second, "amina@example.com")
    r = await first.post(
        "/api/v1/users/me/password",
        json={"current_password": PASSWORD, "new_password": "a-brand-new-password"},
    )
    assert r.status_code == 204
    assert (await first.get("/api/v1/users/me")).status_code == 200  # current session kept
    assert (await second.get("/api/v1/users/me")).status_code == 401  # other session revoked
    third = await new_client()
    old = await third.post(
        "/api/v1/auth/login", json={"email": "amina@example.com", "password": PASSWORD}
    )
    assert old.status_code == 401
    for c in (first, second, third):
        await c.aclose()


async def test_change_password_validation_and_auth(employee_client: AsyncClient) -> None:
    url = "/api/v1/users/me/password"
    wrong = await employee_client.post(
        url, json={"current_password": "nope", "new_password": "a-brand-new-password"}
    )
    assert wrong.status_code == 400
    short = await employee_client.post(
        url, json={"current_password": PASSWORD, "new_password": "short"}
    )
    assert short.status_code == 422
    anonymous = await new_client()
    assert (
        await anonymous.post(url, json={"current_password": "x", "new_password": "y" * 12})
    ).status_code == 401
    await anonymous.aclose()


async def test_admin_password_reset_signs_user_out(admin_client: AsyncClient) -> None:
    user_client, user = await logged_in("lucas@example.com")
    r = await admin_client.patch(
        f"/api/v1/admin/users/{user.id}", json={"new_password": "reset-by-admin-123"}
    )
    assert r.status_code == 200
    assert (await user_client.get("/api/v1/users/me")).status_code == 401
    fresh = await new_client()
    ok = await fresh.post(
        "/api/v1/auth/login", json={"email": "lucas@example.com", "password": "reset-by-admin-123"}
    )
    assert ok.status_code == 200
    short = await admin_client.patch(
        f"/api/v1/admin/users/{user.id}", json={"new_password": "short"}
    )
    assert short.status_code == 422
    await user_client.aclose()
    await fresh.aclose()


def test_docs_hidden_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.settings import Settings, get_settings
    from app.main import create_app

    prod = Settings(environment="production", secret_key="x" * 40)
    monkeypatch.setattr("app.main.get_settings", lambda: prod)
    app = create_app()
    assert app.docs_url is None and app.openapi_url is None
    assert get_settings().environment == "test"  # the real settings were not changed
