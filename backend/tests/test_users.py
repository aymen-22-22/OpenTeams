from httpx import AsyncClient

from tests.conftest import make_user


async def test_me(employee_client: AsyncClient) -> None:
    r = await employee_client.get("/api/v1/users/me")
    assert r.status_code == 200
    assert r.json()["role"] == "employee"


async def test_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "not_authenticated"


async def test_update_me(employee_client: AsyncClient) -> None:
    r = await employee_client.patch("/api/v1/users/me", json={"locale": "ar", "display_name": "A"})
    assert r.status_code == 200
    assert r.json()["locale"] == "ar"


async def test_update_me_validation(employee_client: AsyncClient) -> None:
    r = await employee_client.patch("/api/v1/users/me", json={"locale": "de"})
    assert r.status_code == 422


async def test_update_me_cannot_change_role(employee_client: AsyncClient) -> None:
    r = await employee_client.patch("/api/v1/users/me", json={"role": "admin"})
    assert r.status_code == 200
    assert r.json()["role"] == "employee"


async def test_update_me_requires_auth(client: AsyncClient) -> None:
    assert (await client.patch("/api/v1/users/me", json={"locale": "en"})).status_code == 401


async def test_people_list_hides_inactive_and_shows_presence(employee_client: AsyncClient) -> None:
    await make_user("lucas@example.com")
    await make_user("gone@example.com", active=False)
    r = await employee_client.get("/api/v1/users")
    assert r.status_code == 200
    people = r.json()
    assert [p["display_name"] for p in people] == ["Amina", "Lucas"]
    assert all(p["presence"] == "offline" and p["ai_active"] is False for p in people)
    assert "email" not in people[0]


async def test_people_list_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/users")).status_code == 401


async def test_teams_list(admin_client: AsyncClient, employee_client: AsyncClient) -> None:
    team = (await admin_client.post("/api/v1/admin/teams", json={"name": "Ops"})).json()
    me = (await employee_client.get("/api/v1/users/me")).json()
    await admin_client.post(f"/api/v1/admin/teams/{team['id']}/members", json={"user_id": me["id"]})
    r = await employee_client.get("/api/v1/teams")
    assert r.json() == [{"id": team["id"], "name": "Ops", "member_ids": [me["id"]]}]


async def test_teams_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/teams")).status_code == 401
