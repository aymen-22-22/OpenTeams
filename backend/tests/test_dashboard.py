from httpx import AsyncClient

from app.users.models import Role
from tests.conftest import FakeClock, logged_in, new_client


async def test_dashboard_workload_delays_and_planned(fake_clock: FakeClock) -> None:
    boss, _ = await logged_in("boss@example.com", Role.MANAGER)
    amina_client, amina = await logged_in("amina@example.com")
    a = str(amina.id)
    # fake clock: Monday 2026-01-05 -> week 05..11
    late = (
        await boss.post(
            "/api/v1/tasks", json={"title": "En retard", "assignee_id": a, "due_date": "2026-01-02"}
        )
    ).json()
    planned = (
        await boss.post(
            "/api/v1/tasks",
            json={"title": "Cette semaine", "assignee_id": a, "due_date": "2026-01-08"},
        )
    ).json()
    await boss.post(
        "/api/v1/tasks", json={"title": "Plus tard", "assignee_id": a, "due_date": "2026-03-01"}
    )
    await boss.post(f"/api/v1/tasks/{planned['id']}/move", json={"status": "finished"})
    await boss.post(f"/api/v1/tasks/{late['id']}/move", json={"status": "in_progress"})

    d = (await boss.get("/api/v1/dashboard")).json()
    assert (d["period_start"], d["period_end"]) == ("2026-01-05", "2026-01-11")
    row = next(p for p in d["people"] if p["display_name"] == "Amina")
    assert (row["pending"], row["in_progress"], row["overdue"]) == (1, 1, 1)
    assert (row["planned"], row["finished_planned"], row["finished"]) == (1, 1, 1)
    assert d["delays"][0]["title"] == "En retard" and d["delays"][0]["days_late"] == 3
    assert d["totals"]["overdue"] == 1

    month = (await boss.get("/api/v1/dashboard", params={"period": "month"})).json()
    assert (month["period_start"], month["period_end"]) == ("2026-01-01", "2026-01-31")
    await amina_client.aclose()
    await boss.aclose()


async def test_dashboard_is_for_managers(employee_client: AsyncClient) -> None:
    assert (await employee_client.get("/api/v1/dashboard")).status_code == 403
    anonymous = await new_client()
    assert (await anonymous.get("/api/v1/dashboard")).status_code == 401
    await anonymous.aclose()
    boss, _ = await logged_in("boss@example.com", Role.MANAGER)
    assert (await boss.get("/api/v1/dashboard", params={"period": "year"})).status_code == 422
    await boss.aclose()
