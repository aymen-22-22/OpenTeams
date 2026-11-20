from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.auth.deps import DB, CurrentUser
from app.chat.models import ConversationMember, Message
from app.chat.schemas import MessageOut

router = APIRouter(tags=["search"])


class SearchResults(BaseModel):
    messages: list[MessageOut]
    # files, tasks and projects are added by their phases


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
    return SearchResults(messages=[MessageOut.of(m) for m in rows])
