from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from app.users.models import Role, User
from tests.conftest import logged_in


@dataclass
class Org:
    amina: AsyncClient  # employee
    lucas: AsyncClient  # employee
    boss: AsyncClient  # manager (approver)
    amina_user: User
    boss_user: User


@pytest.fixture
async def org() -> AsyncIterator[Org]:
    amina, a = await logged_in("amina@example.com")
    lucas, _ = await logged_in("lucas@example.com")
    boss, b = await logged_in("boss@example.com", Role.MANAGER)
    yield Org(amina, lucas, boss, a, b)
    for c in (amina, lucas, boss):
        await c.aclose()


def leave(org: Org, **extra: Any) -> dict[str, Any]:
    return {
        "kind": "leave",
        "title": "Congés d'hiver",
        "approver_id": str(org.boss_user.id),
        "start_date": "2026-02-09",
        "end_date": "2026-02-13",
        "leave_type": "paid",
        **extra,
    }


async def submit(client: AsyncClient, body: dict[str, Any]) -> Any:
    r = await client.post("/api/v1/requests", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_submit_leave_notifies_approver(org: Org) -> None:
    r = await submit(org.amina, leave(org))
    assert r["status"] == "pending" and r["details"]["leave_type"] == "paid"
    assert [s["action"] for s in r["steps"]] == ["submitted"]
    n = (await org.boss.get("/api/v1/notifications")).json()["items"][0]
    assert (n["type"], n["title"], n["link"]) == ("approval", "Congés d'hiver", "/requests")
    inbox = (await org.boss.get("/api/v1/requests", params={"box": "to_approve"})).json()
    assert [x["id"] for x in inbox] == [r["id"]]


async def test_validation(org: Org) -> None:
    url = "/api/v1/requests"
    assert (await org.amina.post(url, json=leave(org, start_date=None))).status_code == 422
    assert (await org.amina.post(url, json=leave(org, end_date="2026-02-01"))).status_code == 422
    assert (await org.amina.post(url, json=leave(org, leave_type="party"))).status_code == 422
    expense = {"kind": "expense", "title": "Taxi", "approver_id": str(org.boss_user.id)}
    assert (await org.amina.post(url, json=expense)).status_code == 422
    assert (await org.amina.post(url, json={**expense, "amount": "-5"})).status_code == 422
    # approver must be a manager or admin, and not yourself
    lucas_id = (await org.lucas.get("/api/v1/users/me")).json()["id"]
    assert (await org.amina.post(url, json=leave(org, approver_id=lucas_id))).status_code == 422
    r = await org.boss.post(url, json=leave(org))  # boss approving himself
    assert r.status_code == 422


async def test_approve_leave_creates_day_off_for_everyone(org: Org) -> None:
    r = await submit(org.amina, leave(org))
    done = (
        await org.boss.post(
            f"/api/v1/requests/{r['id']}/approve", json={"comment": "Bonnes vacances"}
        )
    ).json()
    assert done["status"] == "approved" and done["decision_comment"] == "Bonnes vacances"
    assert [s["action"] for s in done["steps"]] == ["submitted", "approved"]
    note = (await org.amina.get("/api/v1/notifications")).json()["items"][0]
    assert note["type"] == "approval" and note["body"].startswith("✅ Boss")
    rng = {"start": "2026-02-01T00:00:00Z", "end": "2026-03-01T00:00:00Z"}
    events = (await org.lucas.get("/api/v1/calendar/events", params=rng)).json()  # a colleague
    [day_off] = [e for e in events if e["type"] == "day_off"]
    assert day_off["title"] == "Amina" and day_off["all_day"] is True
    assert day_off["starts_at"].startswith("2026-02-09") and day_off["ends_at"].startswith(
        "2026-02-13"
    )
    assert "Congés" not in str(events)  # request details stay private


async def test_reject_and_no_double_decision(org: Org) -> None:
    r = await submit(
        org.amina, {"kind": "equipment", "title": 'Écran 27"', "approver_id": str(org.boss_user.id)}
    )
    url = f"/api/v1/requests/{r['id']}"
    assert (await org.boss.post(f"{url}/reject", json={"comment": "Budget"})).json()[
        "status"
    ] == "rejected"
    assert (await org.boss.post(f"{url}/approve", json={})).status_code == 409
    assert (
        (await org.amina.get("/api/v1/notifications")).json()["items"][0]["body"].startswith("❌")
    )


async def test_only_the_approver_decides(org: Org) -> None:
    r = await submit(org.amina, leave(org))
    url = f"/api/v1/requests/{r['id']}"
    assert (await org.amina.post(f"{url}/approve", json={})).status_code == 403  # own request
    assert (await org.lucas.post(f"{url}/approve", json={})).status_code == 404
    assert (await org.lucas.get(url)).status_code == 404
    assert (await org.boss.get(url)).status_code == 200


async def test_cancel_pending_only(org: Org) -> None:
    r = await submit(org.amina, leave(org))
    url = f"/api/v1/requests/{r['id']}"
    assert (await org.lucas.post(f"{url}/cancel")).status_code == 404
    assert (await org.amina.post(f"{url}/cancel")).json()["status"] == "cancelled"
    assert (await org.amina.post(f"{url}/cancel")).status_code == 409
    assert (await org.boss.post(f"{url}/approve", json={})).status_code == 409


async def test_expense_details(org: Org) -> None:
    r = await submit(
        org.amina,
        {
            "kind": "expense",
            "title": "Train",
            "amount": "84.50",
            "approver_id": str(org.boss_user.id),
        },
    )
    assert r["details"] == {"amount": "84.50", "currency": "EUR"}


async def test_approvers_list(org: Org) -> None:
    names = [a["display_name"] for a in (await org.amina.get("/api/v1/requests/approvers")).json()]
    assert names == ["Boss"]


async def test_requests_require_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/requests")).status_code == 401
    assert (await client.get("/api/v1/requests/approvers")).status_code == 401
