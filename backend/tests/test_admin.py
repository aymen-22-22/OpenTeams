import uuid

from httpx import AsyncClient

from tests.conftest import make_user

NEW_USER = {
    "email": "Lucas@Example.com",
    "display_name": "Lucas",
    "password": "a-long-password-1",
    "role": "manager",
}


async def test_create_user_and_login(admin_client: AsyncClient, client: AsyncClient) -> None:
    r = await admin_client.post("/api/v1/admin/users", json=NEW_USER)
    assert r.status_code == 201
    assert r.json()["email"] == "lucas@example.com"
    assert r.json()["role"] == "manager"
    login = await client.post(
        "/api/v1/auth/login", json={"email": "lucas@example.com", "password": NEW_USER["password"]}
    )
    assert login.status_code == 200


async def test_create_user_duplicate_email(admin_client: AsyncClient) -> None:
    await admin_client.post("/api/v1/admin/users", json=NEW_USER)
    r = await admin_client.post("/api/v1/admin/users", json=NEW_USER)
    assert r.status_code == 409


async def test_create_user_validation(admin_client: AsyncClient) -> None:
    r = await admin_client.post("/api/v1/admin/users", json={**NEW_USER, "password": "short"})
    assert r.status_code == 422


async def test_create_user_forbidden_for_employee(employee_client: AsyncClient) -> None:
    r = await employee_client.post("/api/v1/admin/users", json=NEW_USER)
    assert r.status_code == 403


async def test_create_user_forbidden_for_manager(client: AsyncClient) -> None:
    from app.users.models import Role
    from tests.conftest import login

    await make_user("boss@example.com", Role.MANAGER)
    await login(client, "boss@example.com")
    assert (await client.post("/api/v1/admin/users", json=NEW_USER)).status_code == 403


async def test_create_user_requires_auth(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/admin/users", json=NEW_USER)).status_code == 401


async def test_deactivate_user_ends_access(admin_client: AsyncClient, client: AsyncClient) -> None:
    from tests.conftest import login

    user = await make_user("lucas@example.com")
    await login(client, "lucas@example.com")
    r = await admin_client.patch(f"/api/v1/admin/users/{user.id}", json={"is_active": False})
    assert r.status_code == 200
    assert (await client.get("/api/v1/users/me")).status_code == 401


async def test_admin_cannot_demote_self(admin_client: AsyncClient) -> None:
    me = (await admin_client.get("/api/v1/users/me")).json()
    r = await admin_client.patch(f"/api/v1/admin/users/{me['id']}", json={"role": "employee"})
    assert r.status_code == 400


async def test_update_unknown_user(admin_client: AsyncClient) -> None:
    r = await admin_client.patch(f"/api/v1/admin/users/{uuid.uuid4()}", json={"role": "manager"})
    assert r.status_code == 404


async def test_update_user_validation(admin_client: AsyncClient) -> None:
    r = await admin_client.patch(f"/api/v1/admin/users/{uuid.uuid4()}", json={"role": "boss"})
    assert r.status_code == 422


async def test_update_user_forbidden(employee_client: AsyncClient) -> None:
    r = await employee_client.patch(f"/api/v1/admin/users/{uuid.uuid4()}", json={"role": "admin"})
    assert r.status_code == 403


async def test_team_crud(admin_client: AsyncClient) -> None:
    team = await admin_client.post("/api/v1/admin/teams", json={"name": "Ops"})
    assert team.status_code == 201
    assert (await admin_client.post("/api/v1/admin/teams", json={"name": "Ops"})).status_code == 409
    user = await make_user("lucas@example.com")
    url = f"/api/v1/admin/teams/{team.json()['id']}/members"
    assert (await admin_client.post(url, json={"user_id": str(user.id)})).status_code == 204
    assert (await admin_client.delete(f"{url}/{user.id}")).status_code == 204
    assert (await admin_client.delete(f"{url}/{user.id}")).status_code == 404


async def test_team_validation(admin_client: AsyncClient) -> None:
    assert (await admin_client.post("/api/v1/admin/teams", json={"name": ""})).status_code == 422


async def test_team_forbidden(employee_client: AsyncClient) -> None:
    r = await employee_client.post("/api/v1/admin/teams", json={"name": "Ops"})
    assert r.status_code == 403
