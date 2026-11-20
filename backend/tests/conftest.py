import os
import tempfile

os.environ["ENVIRONMENT"] = "test"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["LOCAL_STORAGE_DIR"] = tempfile.mkdtemp(prefix="openteams-files-")
os.environ["MAX_UPLOAD_MB"] = "1"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://openteams:openteams@localhost:5432/openteams_test",
)

from collections.abc import AsyncIterator, Iterator  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.auth.router import login_limiter  # noqa: E402
from app.core import clock  # noqa: E402
from app.core.db import SessionLocal, engine  # noqa: E402
from app.core.security import CSRF_COOKIE, CSRF_HEADER, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.users import presence  # noqa: E402
from app.users.models import Role, User  # noqa: E402

PASSWORD = "correct-horse-battery"
TABLES = (
    "file_versions, files, realtime_events, pins, message_reads, messages, "
    "conversation_members, conversations, audit_log, sessions, team_members, teams, users"
)


@pytest.fixture(scope="session", autouse=True)
def database() -> None:
    """Fresh schema built by the real migrations (so migrations are tested too)."""

    async def reset_schema() -> None:
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))

    import asyncio

    asyncio.run(reset_schema())
    cfg = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).parents[1] / "migrations"))
    command.upgrade(cfg, "head")


class FakeClock:
    def __init__(self) -> None:
        self.current = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.current

    def advance(self, **kwargs: float) -> None:
        self.current += timedelta(**kwargs)


@pytest.fixture(autouse=True)
async def clean_state() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} CASCADE"))
    login_limiter.reset()
    presence.reset()
    yield
    clock.set_clock(None)


@pytest.fixture
def fake_clock() -> Iterator[FakeClock]:
    fc = FakeClock()
    clock.set_clock(fc)
    yield fc


async def make_user(
    email: str = "amina@example.com", role: Role = Role.EMPLOYEE, active: bool = True
) -> User:
    async with SessionLocal() as db:
        user = User(
            email=email,
            display_name=email.split("@")[0].title(),
            password_hash=hash_password(PASSWORD),
            role=role,
            is_active=active,
        )
        db.add(user)
        await db.commit()
        return user


async def new_client() -> AsyncClient:
    """A client with a valid CSRF cookie and header, like the real frontend."""
    client = AsyncClient(transport=ASGITransport(app=app), base_url="https://test")
    await client.get("/api/v1/auth/csrf")
    client.headers[CSRF_HEADER] = client.cookies[CSRF_COOKIE]
    return client


async def login(client: AsyncClient, email: str) -> None:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    client.headers[CSRF_HEADER] = client.cookies[CSRF_COOKIE]


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    c = await new_client()
    yield c
    await c.aclose()


@pytest.fixture
async def employee_client(client: AsyncClient) -> AsyncClient:
    await make_user("amina@example.com")
    await login(client, "amina@example.com")
    return client


@pytest.fixture
async def admin_client() -> AsyncIterator[AsyncClient]:
    await make_user("admin@example.com", Role.ADMIN)
    c = await new_client()
    await login(c, "admin@example.com")
    yield c
    await c.aclose()


async def logged_in(email: str, role: Role = Role.EMPLOYEE) -> tuple[AsyncClient, User]:
    user = await make_user(email, role)
    c = await new_client()
    await login(c, email)
    return c, user
