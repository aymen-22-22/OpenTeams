import uuid

from fastapi import APIRouter
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import audit
from app.auth.deps import DB, CurrentUser
from app.chat.models import ConversationMember
from app.core import clock
from app.core.errors import AppError
from app.files.models import File
from app.files.schemas import FileOut
from app.projects.access import require_editable, require_project, visible_projects
from app.projects.models import Milestone, Project, ProjectMember, ProjectStatus
from app.projects.schemas import MilestoneIn, MilestoneOut, ProjectDetail, ProjectIn, ProjectOut
from app.tasks.access import visible_tasks
from app.tasks.models import Task
from app.tasks.schemas import TaskCounts, TaskOut
from app.users.models import Role, User

router = APIRouter(prefix="/projects", tags=["projects"])


async def _member_ids(db: AsyncSession, project_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        await db.scalars(
            select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)
        )
    )


async def _out(db: AsyncSession, p: Project, user: User) -> ProjectOut:
    tasks = visible_tasks(user).where(Task.project_id == p.id).subquery()
    rows = await db.execute(select(tasks.c.status, func.count()).group_by(tasks.c.status))
    return ProjectOut(
        id=p.id,
        name=p.name,
        description=p.description,
        status=p.status,
        owner_id=p.owner_id,
        start_date=p.start_date,
        due_date=p.due_date,
        finished_at=p.finished_at,
        member_ids=await _member_ids(db, p.id),
        counts=TaskCounts(**{str(s): c for s, c in rows.all()}),
        can_edit=p.owner_id == user.id or user.role in (Role.ADMIN, Role.MANAGER),
    )


async def _set_members(db: AsyncSession, p: Project, ids: set[uuid.UUID]) -> None:
    for uid in ids:
        u = await db.get(User, uid)
        if u is None or not u.is_active:
            raise AppError("invalid_member", "Unknown member", 422)
    current = set(await _member_ids(db, p.id))
    if current - ids:
        await db.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == p.id, ProjectMember.user_id.in_(current - ids)
            )
        )
    db.add_all([ProjectMember(project_id=p.id, user_id=uid) for uid in ids - current])


def _apply(p: Project, body: ProjectIn) -> None:
    if body.status == ProjectStatus.FINISHED and p.status != ProjectStatus.FINISHED:
        p.finished_at = clock.now()
    elif body.status != ProjectStatus.FINISHED:
        p.finished_at = None
    for field in ("name", "description", "status", "start_date", "due_date"):
        setattr(p, field, getattr(body, field))


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: CurrentUser, db: DB) -> list[ProjectOut]:
    projects = await db.scalars(visible_projects(user).order_by(Project.status, Project.name))
    return [await _out(db, p, user) for p in projects]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectIn, user: CurrentUser, db: DB) -> ProjectOut:
    p = Project(owner_id=user.id)
    _apply(p, body)
    db.add(p)
    await db.flush()
    await _set_members(db, p, set(body.member_ids) | {user.id})
    audit.record(db, user.id, "project.created", "project", p.id)
    await db.commit()
    return await _out(db, p, user)


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: uuid.UUID, user: CurrentUser, db: DB) -> ProjectDetail:
    p = await require_project(db, project_id, user)
    today = clock.now().date()
    tasks = list(
        await db.scalars(
            visible_tasks(user).where(Task.project_id == p.id).order_by(Task.status, Task.position)
        )
    )
    milestones = await db.scalars(
        select(Milestone).where(Milestone.project_id == p.id).order_by(Milestone.date)
    )
    # Files of the project's task chats that this user belongs to
    my_chats = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user.id
    )
    files = await db.scalars(
        select(File)
        .where(
            File.conversation_id.in_([t.conversation_id for t in tasks]),
            File.conversation_id.in_(my_chats),
        )
        .order_by(File.updated_at.desc())
        .limit(50)
    )
    base = await _out(db, p, user)
    return ProjectDetail(
        **base.model_dump(),
        milestones=[MilestoneOut.model_validate(m) for m in milestones],
        tasks=[TaskOut.of(t, today) for t in tasks],
        files=[FileOut.model_validate(f) for f in files],
    )


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID, body: ProjectIn, user: CurrentUser, db: DB
) -> ProjectOut:
    p = await require_editable(db, project_id, user)
    _apply(p, body)
    await _set_members(db, p, set(body.member_ids) | ({p.owner_id} if p.owner_id else set()))
    audit.record(db, user.id, "project.updated", "project", p.id, status=p.status.value)
    await db.commit()
    return await _out(db, p, user)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    p = await require_editable(db, project_id, user)
    await db.delete(p)  # tasks keep existing, their project_id is cleared (ON DELETE SET NULL)
    await db.commit()


@router.post("/{project_id}/milestones", response_model=MilestoneOut, status_code=201)
async def add_milestone(
    project_id: uuid.UUID, body: MilestoneIn, user: CurrentUser, db: DB
) -> Milestone:
    await require_editable(db, project_id, user)
    m = Milestone(project_id=project_id, **body.model_dump())
    db.add(m)
    await db.commit()
    return m


async def _milestone(db: AsyncSession, milestone_id: uuid.UUID, user: User) -> Milestone:
    m = await db.get(Milestone, milestone_id)
    if m is None:
        raise AppError("not_found", "Milestone not found", 404)
    await require_editable(db, m.project_id, user)
    return m


@router.put("/milestones/{milestone_id}", response_model=MilestoneOut)
async def update_milestone(
    milestone_id: uuid.UUID, body: MilestoneIn, user: CurrentUser, db: DB
) -> Milestone:
    m = await _milestone(db, milestone_id, user)
    for field, value in body.model_dump().items():
        setattr(m, field, value)
    await db.commit()
    return m


@router.delete("/milestones/{milestone_id}", status_code=204)
async def delete_milestone(milestone_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _milestone(db, milestone_id, user))
    await db.commit()
