from fastapi import APIRouter
from sqlalchemy import select

from app.ai.models import AIProfile
from app.ai.rules import is_ready
from app.auth.deps import DB, CurrentUser
from app.users import presence
from app.users.models import Team, TeamMember, User
from app.users.schemas import MeUpdate, PersonOut, TeamOut, UserOut

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=UserOut)
async def get_me(user: CurrentUser) -> User:
    return user


@router.patch("/users/me", response_model=UserOut)
async def update_me(body: MeUpdate, user: CurrentUser, db: DB) -> User:
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    return user


@router.get("/users", response_model=list[PersonOut])
async def list_people(_: CurrentUser, db: DB) -> list[PersonOut]:
    users = await db.scalars(
        select(User).where(User.is_active.is_(True)).order_by(User.display_name)
    )
    profiles = {p.user_id: p for p in await db.scalars(select(AIProfile))}
    return [
        PersonOut(
            id=u.id,
            display_name=u.display_name,
            role=u.role,
            presence=presence.get(u.id),
            ai_active=is_ready(profiles.get(u.id)),
        )
        for u in users
    ]


@router.get("/teams", response_model=list[TeamOut])
async def list_teams(_: CurrentUser, db: DB) -> list[TeamOut]:
    teams = (await db.scalars(select(Team).order_by(Team.name))).all()
    members = (await db.execute(select(TeamMember.team_id, TeamMember.user_id))).all()
    return [
        TeamOut(id=t.id, name=t.name, member_ids=[m.user_id for m in members if m.team_id == t.id])
        for t in teams
    ]
