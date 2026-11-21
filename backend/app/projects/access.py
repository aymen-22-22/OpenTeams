"""Projects are visible to their members, and to managers and admins."""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.projects.models import Project, ProjectMember
from app.users.models import Role, User


def visible_projects(user: User) -> Select[Project]:
    query = select(Project)
    if user.role in (Role.ADMIN, Role.MANAGER):
        return query
    return query.where(
        Project.id.in_(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id))
    )


async def require_project(db: AsyncSession, project_id: uuid.UUID, user: User) -> Project:
    project = await db.scalar(visible_projects(user).where(Project.id == project_id))
    if project is None:
        raise AppError("not_found", "Project not found", 404)
    return project


async def require_editable(db: AsyncSession, project_id: uuid.UUID, user: User) -> Project:
    """The owner, managers and admins can change a project; other members can only read it."""
    project = await require_project(db, project_id, user)
    if project.owner_id != user.id and user.role not in (Role.ADMIN, Role.MANAGER):
        raise AppError("forbidden", "Only the project owner or a manager can change it", 403)
    return project
