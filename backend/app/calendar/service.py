"""Builds the calendar: stored events the user may see + events computed from visible tasks."""

import uuid
from datetime import datetime, time, timedelta

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.calendar.models import CalendarEvent, EventAttendee, EventType
from app.calendar.schemas import EventOut
from app.projects.access import visible_projects
from app.projects.models import Milestone, ProjectMember
from app.tasks.access import visible_tasks
from app.tasks.models import Task
from app.users.models import User


async def attendees(
    db: AsyncSession, event_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    result: dict[uuid.UUID, list[uuid.UUID]] = {eid: [] for eid in event_ids}
    rows = await db.execute(
        select(EventAttendee.event_id, EventAttendee.user_id).where(
            EventAttendee.event_id.in_(event_ids)
        )
    )
    for eid, uid in rows.all():
        result[eid].append(uid)
    return result


def visible_events(user: User) -> Select[CalendarEvent]:
    """Meetings are private to creator and attendees; days off are visible to the whole team."""
    return select(CalendarEvent).where(
        or_(
            CalendarEvent.type == EventType.DAY_OFF,
            CalendarEvent.creator_id == user.id,
            CalendarEvent.id.in_(
                select(EventAttendee.event_id).where(EventAttendee.user_id == user.id)
            ),
        )
    )


def stored_out(e: CalendarEvent, users: list[uuid.UUID]) -> EventOut:
    return EventOut(
        id=str(e.id),
        type=e.type,
        title=e.title,
        starts_at=e.starts_at,
        ends_at=e.ends_at,
        all_day=e.all_day,
        user_ids=users,
        creator_id=e.creator_id,
        description=e.description,
        conversation_id=e.conversation_id,
    )


async def list_events(
    db: AsyncSession, user: User, start: datetime, end: datetime, people: list[uuid.UUID] | None
) -> list[EventOut]:
    events: list[EventOut] = []

    # Stored events overlapping the range
    stored = list(
        await db.scalars(
            visible_events(user).where(
                CalendarEvent.starts_at < end, CalendarEvent.ends_at >= start
            )
        )
    )
    who = await attendees(db, [e.id for e in stored])
    for e in stored:
        users = who[e.id]
        if people is None or set(users) & set(people):
            events.append(stored_out(e, users))

    # Computed from tasks the user can see (same rule as the board)
    tasks = visible_tasks(user)
    if people is not None:
        tasks = tasks.where(Task.assignee_id.in_(people))
    tz = start.tzinfo
    for t in await db.scalars(
        tasks.where(Task.due_date >= start.date(), Task.due_date <= end.date())
    ):
        assert t.due_date is not None
        day = datetime.combine(t.due_date, time(0), tz)
        events.append(
            EventOut(
                id=f"task-due:{t.id}",
                type=EventType.TASK_DUE,
                title=t.title,
                starts_at=day,
                ends_at=day,
                all_day=True,
                user_ids=[t.assignee_id] if t.assignee_id else [],
                task_id=t.id,
            )
        )
    for t in await db.scalars(tasks.where(Task.finished_at >= start, Task.finished_at < end)):
        assert t.finished_at is not None
        events.append(
            EventOut(
                id=f"task-finished:{t.id}",
                type=EventType.TASK_FINISHED,
                title=t.title,
                starts_at=t.finished_at,
                ends_at=t.finished_at + timedelta(minutes=30),
                all_day=False,
                user_ids=[t.assignee_id] if t.assignee_id else [],
                task_id=t.id,
            )
        )
    events += await project_events(db, user, start, end, people)
    return sorted(events, key=lambda e: (e.starts_at, e.title))


async def project_events(
    db: AsyncSession, user: User, start: datetime, end: datetime, people: list[uuid.UUID] | None
) -> list[EventOut]:
    """Milestones and finished projects of the projects the user can see."""
    projects = {p.id: p for p in await db.scalars(visible_projects(user))}
    if not projects:
        return []
    members: dict[uuid.UUID, list[uuid.UUID]] = {pid: [] for pid in projects}
    for pid, uid in (
        await db.execute(
            select(ProjectMember.project_id, ProjectMember.user_id).where(
                ProjectMember.project_id.in_(projects)
            )
        )
    ).all():
        members[pid].append(uid)
    keep = {pid for pid in projects if people is None or set(members[pid]) & set(people)}
    events: list[EventOut] = []
    tz = start.tzinfo
    for m in await db.scalars(
        select(Milestone).where(
            Milestone.project_id.in_(keep),
            Milestone.date >= start.date(),
            Milestone.date <= end.date(),
        )
    ):
        day = datetime.combine(m.date, time(0), tz)
        events.append(
            EventOut(
                id=f"milestone:{m.id}",
                type=EventType.MILESTONE,
                title=f"{projects[m.project_id].name} — {m.title}",
                starts_at=day,
                ends_at=day,
                all_day=True,
                user_ids=members[m.project_id],
                project_id=m.project_id,
            )
        )
    for p in projects.values():
        if p.id in keep and p.finished_at and start <= p.finished_at < end:
            events.append(
                EventOut(
                    id=f"project-finished:{p.id}",
                    type=EventType.PROJECT_FINISHED,
                    title=p.name,
                    starts_at=p.finished_at,
                    ends_at=p.finished_at,
                    all_day=True,
                    user_ids=members[p.id],
                    project_id=p.id,
                )
            )
    return events
