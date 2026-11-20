from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_session
from app.main import app


class FakeSession:
    def __init__(self, fail: bool) -> None:
        self.fail = fail

    async def execute(self, *_: Any) -> None:
        if self.fail:
            raise ConnectionError("database down")


def use_session(fail: bool) -> None:
    async def override() -> AsyncIterator[FakeSession]:
        yield FakeSession(fail)

    app.dependency_overrides[get_session] = override


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def test_health_ok(client: AsyncClient) -> None:
    use_session(fail=False)
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


async def test_health_reports_database_down(client: AsyncClient) -> None:
    use_session(fail=True)
    response = await client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "error"}


async def test_unknown_route_uses_error_format(client: AsyncClient) -> None:
    response = await client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_error"
