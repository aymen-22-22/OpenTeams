import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.auth.deps import DB, CurrentUser
from app.calendar.ical import to_ical
from app.calendar.models import CalendarEvent, EventAttendee, EventType
from app.calendar.schemas import EventOut, FeedUrl, MeetingIn
from app.calendar.service import attendees, list_events, stored_out
from app.chat.access import is_member
from app.chat.models import ConversationMember
from app.core import clock
from app.core.errors import AppError
from app.core.settings import get_settings
from app.reminders.models import NotificationType
from app.reminders.notify import notify, push
from app.users.models import TeamMember, User

router = APIRouter(prefix="/calendar", tags=["calendar"])

MAX_RANGE = timedelta(days=100)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.get("/events", response_model=list[EventOut])
async def get_events(
    user: CurrentUser,
    db: DB,
    start: datetime,
    end: datetime,
    user_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> list[EventOut]:
    if start.tzinfo is None or end.tzinfo is None:
        raise AppError("invalid_range", "start and end must include a timezone", 422)
    if end <= start or end - start > MAX_RANGE:
        raise AppError("invalid_range", "The range must be positive and at most 100 days", 422)
    people: list[uuid.UUID] | None = None
    if user_id is not None:
        people = [user_id]
    elif team_id is not None:
        people = list(
            await db.scalars(select(TeamMember.user_id).where(TeamMember.team_id == team_id))
        )
    return await list_events(db, user, start, end, people)


async def _attendee_ids(db: DB, body: MeetingIn, user: User) -> set[uuid.UUID]:
    ids = set(body.attendee_ids) | {user.id}
    if body.conversation_id is not None:
        if not await is_member(db, body.conversation_id, user.id):
            raise AppError("not_found", "Conversation not found", 404)
        ids |= set(
            await db.scalars(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == body.conversation_id
                )
            )
        )
    for uid in ids:
        u = await db.get(User, uid)
        if u is None or not u.is_active:
            raise AppError("invalid_attendee", "Unknown attendee", 422)
    return ids


async def _own_event(db: DB, event_id: uuid.UUID, user: User) -> CalendarEvent:
    e = await db.get(CalendarEvent, event_id)
    if e is None:
        raise AppError("not_found", "Event not found", 404)
    if e.creator_id != user.id:
        who = await attendees(db, [e.id])
        if user.id in who[e.id]:
            raise AppError("forbidden", "Only the organizer can change this event", 403)
        raise AppError("not_found", "Event not found", 404)
    return e


@router.post("/events", response_model=EventOut, status_code=201)
async def create_meeting(body: MeetingIn, user: CurrentUser, db: DB) -> EventOut:
    ids = await _attendee_ids(db, body, user)
    event = CalendarEvent(
        type=EventType.MEETING,
        title=body.title,
        description=body.description,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        all_day=body.all_day,
        creator_id=user.id,
        conversation_id=body.conversation_id,
    )
    db.add(event)
    await db.flush()
    db.add_all([EventAttendee(event_id=event.id, user_id=uid) for uid in ids])
    created = [
        await notify(
            db, uid, NotificationType.EVENT, body.title, body=user.display_name, link="/calendar"
        )
        for uid in ids
        if uid != user.id
    ]
    await db.commit()
    await push(db, created)
    return stored_out(event, sorted(ids))


@router.put("/events/{event_id}", response_model=EventOut)
async def update_meeting(
    event_id: uuid.UUID, body: MeetingIn, user: CurrentUser, db: DB
) -> EventOut:
    event = await _own_event(db, event_id, user)
    ids = await _attendee_ids(db, body, user)
    for field in ("title", "description", "starts_at", "ends_at", "all_day", "conversation_id"):
        setattr(event, field, getattr(body, field))
    current = set((await attendees(db, [event.id]))[event.id])
    for uid in current - ids:
        row = await db.scalar(
            select(EventAttendee).where(
                EventAttendee.event_id == event.id, EventAttendee.user_id == uid
            )
        )
        if row:
            await db.delete(row)
    db.add_all([EventAttendee(event_id=event.id, user_id=uid) for uid in ids - current])
    await db.commit()
    return stored_out(event, sorted(ids))


@router.delete("/events/{event_id}", status_code=204)
async def delete_meeting(event_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _own_event(db, event_id, user))
    await db.commit()


@router.post("/feed", response_model=FeedUrl)
async def new_feed_url(user: CurrentUser, db: DB) -> FeedUrl:
    """Create (or replace) the private iCal link. It is shown only once; old links stop working."""
    token = secrets.token_urlsafe(32)
    user.ical_token_hash = _hash(token)
    await db.commit()
    return FeedUrl(url=f"{get_settings().app_url.rstrip('/')}/api/v1/calendar/feed/{token}.ics")


@router.get("/feed/{token}.ics", include_in_schema=False)
async def ical_feed(token: str, db: DB) -> Response:
    """Public by design (calendar apps cannot log in): the long random token is the credential."""
    user = await db.scalar(select(User).where(User.ical_token_hash == _hash(token)))
    if user is None or not user.is_active:
        raise AppError("not_found", "Calendar not found", 404)
    now = clock.now()
    events = await list_events(db, user, now - timedelta(days=60), now + timedelta(days=365), None)
    body = to_ical(events, f"OpenTeams — {user.display_name}", now)
    return Response(
        body,
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=300"},
    )
