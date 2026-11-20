import uuid

from fastapi import APIRouter
from sqlalchemy import func, select

from app.admin import audit
from app.admin.schemas import TeamCreate, TeamMemberAdd, UserAdminUpdate, UserCreate
from app.auth.deps import DB, AdminUser
from app.core.errors import AppError
from app.core.security import hash_password
from app.users.models import Team, TeamMember, User
from app.users.schemas import TeamOut, UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


async def _get_or_404[T](db: DB, model: type[T], id_: uuid.UUID) -> T:
    obj = await db.get(model, id_)
    if obj is None:
        raise AppError("not_found", f"{model.__name__} not found", 404)
    return obj


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate, admin: AdminUser, db: DB) -> User:
    exists = await db.scalar(select(User.id).where(func.lower(User.email) == body.email.lower()))
    if exists:
        raise AppError("email_taken", "A user with this email already exists", 409)
    user = User(
        email=body.email.lower(),
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=body.role,
        locale=body.locale,
    )
    db.add(user)
    await db.flush()
    audit.record(db, admin.id, "admin.user_created", "user", user.id, role=user.role.value)
    await db.commit()
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: uuid.UUID, body: UserAdminUpdate, admin: AdminUser, db: DB) -> User:
    user = await _get_or_404(db, User, user_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if user.id == admin.id and ("role" in changes or changes.get("is_active") is False):
        raise AppError("self_change", "You cannot change your own role or deactivate yourself")
    for field, value in changes.items():
        setattr(user, field, value)
    audit.record(db, admin.id, "admin.user_updated", "user", user.id, fields=sorted(changes))
    await db.commit()
    return user


@router.post("/teams", response_model=TeamOut, status_code=201)
async def create_team(body: TeamCreate, admin: AdminUser, db: DB) -> TeamOut:
    if await db.scalar(select(Team.id).where(Team.name == body.name)):
        raise AppError("team_exists", "A team with this name already exists", 409)
    team = Team(name=body.name)
    db.add(team)
    await db.flush()
    audit.record(db, admin.id, "admin.team_created", "team", team.id)
    await db.commit()
    return TeamOut(id=team.id, name=team.name)


@router.post("/teams/{team_id}/members", status_code=204)
async def add_team_member(
    team_id: uuid.UUID, body: TeamMemberAdd, admin: AdminUser, db: DB
) -> None:
    await _get_or_404(db, Team, team_id)
    await _get_or_404(db, User, body.user_id)
    exists = await db.scalar(
        select(TeamMember.id).where(
            TeamMember.team_id == team_id, TeamMember.user_id == body.user_id
        )
    )
    if not exists:
        db.add(TeamMember(team_id=team_id, user_id=body.user_id))
        audit.record(
            db, admin.id, "admin.team_member_added", "team", team_id, user=str(body.user_id)
        )
        await db.commit()


@router.delete("/teams/{team_id}/members/{user_id}", status_code=204)
async def remove_team_member(
    team_id: uuid.UUID, user_id: uuid.UUID, admin: AdminUser, db: DB
) -> None:
    member = await db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    if member is None:
        raise AppError("not_found", "Membership not found", 404)
    await db.delete(member)
    audit.record(db, admin.id, "admin.team_member_removed", "team", team_id, user=str(user_id))
    await db.commit()
