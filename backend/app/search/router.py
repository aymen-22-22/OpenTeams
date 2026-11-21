import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.auth.deps import DB, CurrentUser
from app.chat.models import ConversationMember, Message
from app.chat.schemas import MessageOut
from app.projects.access import visible_projects
from app.projects.models import Project
from app.tasks.access import visible_tasks
from app.tasks.models import Task

router = APIRouter(tags=["search"])


class Hit(BaseModel):
    id: uuid.UUID
    title: str


class SearchResults(BaseModel):
    messages: list[MessageOut]
    tasks: list[Hit] = []
    projects: list[Hit] = []


@router.get("/search", response_model=SearchResults)
async def search(
    user: CurrentUser,
    db: DB,
    q: Annotated[str, Query(min_length=2, max_length=200)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResults:
    """Full-text search, limited to conversations the user is a member of."""
    query = func.websearch_to_tsquery("simple", q)
    rows = await db.scalars(
        select(Message)
        .where(
            Message.search.op("@@")(query),
            Message.deleted_at.is_(None),
            Message.conversation_id.in_(
                select(ConversationMember.conversation_id).where(
                    ConversationMember.user_id == user.id
                )
            ),
        )
        .order_by(func.ts_rank(Message.search, query).desc(), Message.seq.desc())
        .limit(limit)
    )
    like = f"%{q.replace('%', r'\%').replace('_', r'\_')}%"
    tasks = await db.scalars(visible_tasks(user).where(Task.title.ilike(like)).limit(limit))
    projects = await db.scalars(visible_projects(user).where(Project.name.ilike(like)).limit(limit))
    return SearchResults(
        messages=[MessageOut.of(m) for m in rows],
        tasks=[Hit(id=t.id, title=t.title) for t in tasks],
        projects=[Hit(id=p.id, title=p.name) for p in projects],
    )
