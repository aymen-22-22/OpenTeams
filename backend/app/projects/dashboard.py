"""Manager dashboard: workload per employee, delays, finished versus planned."""

import uuid
from datetime import date, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.deps import DB, require_role
from app.core import clock
from app.core.settings import get_settings
from app.tasks.access import visible_tasks
from app.tasks.models import Task, TaskStatus
from app.users.models import Role, TeamMember, User

router = APIRouter(tags=["dashboard"])

Manager = Annotated[User, Depends(require_role(Role.ADMIN, Role.MANAGER))]


class PersonLoad(BaseModel):
    user_id: uuid.UUID
    display_name: str
    pending: int = 0
    in_progress: int = 0
    overdue: int = 0
    planned: int = 0  # due in the period
    finished_planned: int = 0  # of those, finished
    finished: int = 0  # finished in the period (planned or not)


class Delay(BaseModel):
    task_id: uuid.UUID
    title: str
    assignee_id: uuid.UUID | None
    due_date: date
    days_late: int


class Dashboard(BaseModel):
    period_start: date
    period_end: date
    people: list[PersonLoad]
    totals: PersonLoad
    delays: list[Delay]


@router.get("/dashboard", response_model=Dashboard)
async def dashboard(
    user: Manager,
    db: DB,
    period: Literal["week", "month"] = "week",
    team_id: uuid.UUID | None = None,
) -> Dashboard:
    today = clock.now().astimezone(ZoneInfo(get_settings().timezone)).date()
    start = today - timedelta(days=today.weekday()) if period == "week" else today.replace(day=1)
    end = (
        start + timedelta(days=7)
        if period == "week"
        else (start + timedelta(days=32)).replace(day=1)
    )

    people_q = select(User).where(User.is_active.is_(True)).order_by(User.display_name)
    if team_id is not None:
        people_q = people_q.where(
            User.id.in_(select(TeamMember.user_id).where(TeamMember.team_id == team_id))
        )
    people = {
        u.id: PersonLoad(user_id=u.id, display_name=u.display_name)
        for u in await db.scalars(people_q)
    }

    delays: list[Delay] = []
    for t in await db.scalars(visible_tasks(user).where(Task.assignee_id.in_(people))):
        assert t.assignee_id is not None
        row = people[t.assignee_id]
        done = t.status == TaskStatus.FINISHED
        finished_day = (
            t.finished_at.astimezone(ZoneInfo(get_settings().timezone)).date()
            if t.finished_at
            else None
        )
        if t.status == TaskStatus.PENDING:
            row.pending += 1
        elif t.status == TaskStatus.IN_PROGRESS:
            row.in_progress += 1
        if not done and t.due_date and t.due_date < today:
            row.overdue += 1
            delays.append(
                Delay(
                    task_id=t.id,
                    title=t.title,
                    assignee_id=t.assignee_id,
                    due_date=t.due_date,
                    days_late=(today - t.due_date).days,
                )
            )
        if t.due_date and start <= t.due_date < end:
            row.planned += 1
            row.finished_planned += int(done)
        if finished_day and start <= finished_day < end:
            row.finished += 1

    totals = PersonLoad(user_id=user.id, display_name="")
    for row in people.values():
        for field in (
            "pending",
            "in_progress",
            "overdue",
            "planned",
            "finished_planned",
            "finished",
        ):
            setattr(totals, field, getattr(totals, field) + getattr(row, field))
    return Dashboard(
        period_start=start,
        period_end=end - timedelta(days=1),
        people=list(people.values()),
        totals=totals,
        delays=sorted(delays, key=lambda d: -d.days_late)[:50],
    )
