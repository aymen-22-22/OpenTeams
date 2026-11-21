import uuid
from datetime import UTC, datetime, time
from typing import Literal

from fastapi import APIRouter
from sqlalchemy import select

from app.admin import audit
from app.auth.deps import DB, CurrentUser
from app.calendar.models import CalendarEvent, EventAttendee, EventType
from app.core import clock
from app.core.errors import AppError
from app.reminders.models import NotificationType
from app.reminders.notify import notify, push
from app.requests.models import Request, RequestKind, RequestStatus, RequestStep
from app.requests.schemas import ApproverOut, DecisionIn, RequestIn, RequestOut, StepOut
from app.users.models import Role, User

router = APIRouter(prefix="/requests", tags=["requests"])

APPROVER_ROLES = (Role.MANAGER, Role.ADMIN)


async def _out(db: DB, r: Request) -> RequestOut:
    steps = await db.scalars(
        select(RequestStep).where(RequestStep.request_id == r.id).order_by(RequestStep.created_at)
    )
    out = RequestOut.model_validate(r)
    out.steps = [StepOut.model_validate(s) for s in steps]
    return out


def _step(db: DB, r: Request, actor: User, action: str, comment: str = "") -> None:
    db.add(RequestStep(request_id=r.id, actor_id=actor.id, action=action, comment=comment))
    audit.record(db, actor.id, f"request.{action}", "request", r.id)


async def _visible(db: DB, request_id: uuid.UUID, user: User) -> Request:
    r = await db.get(Request, request_id)
    if r is None or (user.id not in (r.requester_id, r.approver_id) and user.role != Role.ADMIN):
        raise AppError("not_found", "Request not found", 404)
    return r


@router.get("/approvers", response_model=list[ApproverOut])
async def approvers(user: CurrentUser, db: DB) -> list[ApproverOut]:
    rows = await db.scalars(
        select(User)
        .where(User.role.in_(APPROVER_ROLES), User.is_active.is_(True), User.id != user.id)
        .order_by(User.display_name)
    )
    return [ApproverOut(id=u.id, display_name=u.display_name) for u in rows]


@router.get("", response_model=list[RequestOut])
async def list_requests(
    user: CurrentUser, db: DB, box: Literal["mine", "to_approve"] = "mine"
) -> list[RequestOut]:
    column = Request.requester_id if box == "mine" else Request.approver_id
    rows = await db.scalars(
        select(Request).where(column == user.id).order_by(Request.created_at.desc()).limit(200)
    )
    return [await _out(db, r) for r in rows]


@router.post("", response_model=RequestOut, status_code=201)
async def create_request(body: RequestIn, user: CurrentUser, db: DB) -> RequestOut:
    approver = await db.get(User, body.approver_id)
    if (
        approver is None
        or not approver.is_active
        or approver.role not in APPROVER_ROLES
        or approver.id == user.id
    ):
        raise AppError("invalid_approver", "The approver must be another manager or admin", 422)
    details: dict[str, object] = {}
    if body.kind == RequestKind.LEAVE:
        details = {
            "start_date": str(body.start_date),
            "end_date": str(body.end_date),
            "leave_type": body.leave_type,
        }
    elif body.kind == RequestKind.EXPENSE:
        details = {"amount": str(body.amount), "currency": body.currency}
    r = Request(
        requester_id=user.id,
        approver_id=approver.id,
        kind=body.kind,
        title=body.title,
        comment=body.comment,
        details=details,
    )
    db.add(r)
    await db.flush()
    _step(db, r, user, "submitted", body.comment)
    created = [
        await notify(
            db,
            approver.id,
            NotificationType.APPROVAL,
            body.title,
            body=user.display_name,
            link="/requests",
        )
    ]
    await db.commit()
    await push(db, created)
    return await _out(db, r)


@router.get("/{request_id}", response_model=RequestOut)
async def get_request(request_id: uuid.UUID, user: CurrentUser, db: DB) -> RequestOut:
    return await _out(db, await _visible(db, request_id, user))


async def _add_day_off(db: DB, r: Request, approver: User) -> None:
    """Approved leave becomes an all-day calendar event, visible to the whole team."""
    requester = await db.get(User, r.requester_id)
    start = datetime.combine(datetime.fromisoformat(r.details["start_date"]).date(), time(0), UTC)
    end = datetime.combine(datetime.fromisoformat(r.details["end_date"]).date(), time(0), UTC)
    event = CalendarEvent(
        type=EventType.DAY_OFF,
        title=requester.display_name if requester else "?",
        starts_at=start,
        ends_at=end,
        all_day=True,
        creator_id=approver.id,
        request_id=r.id,
    )
    db.add(event)
    await db.flush()
    db.add(EventAttendee(event_id=event.id, user_id=r.requester_id))


async def _decide(
    db: DB, request_id: uuid.UUID, user: User, approve: bool, comment: str
) -> RequestOut:
    r = await db.get(Request, request_id)
    if r is None or r.approver_id != user.id:
        if r is not None and r.requester_id == user.id:
            raise AppError("forbidden", "You cannot decide on your own request", 403)
        raise AppError("not_found", "Request not found", 404)
    if r.status != RequestStatus.PENDING:
        raise AppError("not_pending", "This request was already decided", 409)
    r.status = RequestStatus.APPROVED if approve else RequestStatus.REJECTED
    r.decided_at = clock.now()
    r.decision_comment = comment
    _step(db, r, user, r.status.value, comment)
    if approve and r.kind == RequestKind.LEAVE:
        await _add_day_off(db, r, user)
    icon = "✅" if approve else "❌"
    created = [
        await notify(
            db,
            r.requester_id,
            NotificationType.APPROVAL,
            r.title,
            body=f"{icon} {user.display_name}" + (f" — {comment}" if comment else ""),
            link="/requests",
        )
    ]
    await db.commit()
    await push(db, created)
    return await _out(db, r)


@router.post("/{request_id}/approve", response_model=RequestOut)
async def approve(request_id: uuid.UUID, body: DecisionIn, user: CurrentUser, db: DB) -> RequestOut:
    return await _decide(db, request_id, user, True, body.comment)


@router.post("/{request_id}/reject", response_model=RequestOut)
async def reject(request_id: uuid.UUID, body: DecisionIn, user: CurrentUser, db: DB) -> RequestOut:
    return await _decide(db, request_id, user, False, body.comment)


@router.post("/{request_id}/cancel", response_model=RequestOut)
async def cancel(request_id: uuid.UUID, user: CurrentUser, db: DB) -> RequestOut:
    r = await db.get(Request, request_id)
    if r is None or r.requester_id != user.id:
        raise AppError("not_found", "Request not found", 404)
    if r.status != RequestStatus.PENDING:
        raise AppError("not_pending", "Only pending requests can be cancelled", 409)
    r.status = RequestStatus.CANCELLED
    _step(db, r, user, "cancelled")
    await db.commit()
    return await _out(db, r)
