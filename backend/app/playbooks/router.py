import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.admin import audit
from app.ai.provider import LLM, get_llm
from app.auth.deps import DB, CurrentUser
from app.core import clock
from app.core.errors import AppError
from app.playbooks import report
from app.playbooks.models import Playbook, PlaybookKind, PlaybookRun, RunStatus
from app.playbooks.runner import build, deliver, start_run
from app.playbooks.schedule import next_run, period
from app.playbooks.schemas import PlaybookIn, PlaybookOut, PreviewOut, ReportOut, RunOut
from app.reminders.notify import push
from app.users.models import User

router = APIRouter(prefix="/playbooks", tags=["playbooks"])


def _check_audience(body: PlaybookIn, owner: User) -> None:
    """Employees only report to themselves: they must not send data to people who can't see it."""
    others = [r for r in body.recipient_ids if r != owner.id]
    if not report.sees_team(owner) and (others or body.kind == PlaybookKind.MONDAY_SUMMARY):
        raise AppError("forbidden", "Only managers and admins can send reports to others", 403)


async def _check_users(db: DB, ids: list[uuid.UUID]) -> None:
    for uid in ids:
        u = await db.get(User, uid)
        if u is None or not u.is_active:
            raise AppError("invalid_user", "Unknown user in scope or recipients", 422)


def _apply(p: Playbook, body: PlaybookIn) -> None:
    data = body.model_dump()
    data["scope_user_ids"] = [str(u) for u in body.scope_user_ids]
    data["recipient_ids"] = [str(u) for u in body.recipient_ids]
    for field, value in data.items():
        setattr(p, field, value)
    p.next_run_at = next_run(p, clock.now())


async def _own(db: DB, playbook_id: uuid.UUID, user: User) -> Playbook:
    p = await db.get(Playbook, playbook_id)
    if p is None or p.owner_id != user.id:
        raise AppError("not_found", "Playbook not found", 404)
    return p


@router.get("", response_model=list[PlaybookOut])
async def list_playbooks(user: CurrentUser, db: DB) -> list[Playbook]:
    return list(
        await db.scalars(
            select(Playbook).where(Playbook.owner_id == user.id).order_by(Playbook.name)
        )
    )


@router.post("", response_model=PlaybookOut, status_code=201)
async def create_playbook(body: PlaybookIn, user: CurrentUser, db: DB) -> Playbook:
    _check_audience(body, user)
    await _check_users(db, body.scope_user_ids + body.recipient_ids)
    p = Playbook(owner_id=user.id)
    _apply(p, body)
    db.add(p)
    await db.flush()
    audit.record(db, user.id, "playbook.created", "playbook", p.id, kind=p.kind.value)
    await db.commit()
    return p


@router.put("/{playbook_id}", response_model=PlaybookOut)
async def update_playbook(
    playbook_id: uuid.UUID, body: PlaybookIn, user: CurrentUser, db: DB
) -> Playbook:
    p = await _own(db, playbook_id, user)
    _check_audience(body, user)
    await _check_users(db, body.scope_user_ids + body.recipient_ids)
    _apply(p, body)
    audit.record(db, user.id, "playbook.updated", "playbook", p.id)
    await db.commit()
    return p


@router.delete("/{playbook_id}", status_code=204)
async def delete_playbook(playbook_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _own(db, playbook_id, user))
    await db.commit()


@router.post("/{playbook_id}/preview", response_model=PreviewOut)
async def preview(
    playbook_id: uuid.UUID, user: CurrentUser, db: DB, llm: Annotated[LLM, Depends(get_llm)]
) -> PreviewOut:
    """Build the reports now without saving or delivering anything."""
    p = await _own(db, playbook_id, user)
    now = clock.now()
    start, end = period(p, now)
    run = PlaybookRun(playbook_id=p.id, period_start=start, period_end=end, tokens=0, cost=0.0)
    await build(db, run, p, now, llm)
    await db.commit()  # keeps the AI audit entries, nothing else was added
    return PreviewOut(reports={uuid.UUID(k): v for k, v in run.outputs.items()})


@router.post("/{playbook_id}/run", response_model=RunOut, status_code=201)
async def run_now(
    playbook_id: uuid.UUID, user: CurrentUser, db: DB, llm: Annotated[LLM, Depends(get_llm)]
) -> PlaybookRun:
    p = await _own(db, playbook_id, user)
    return await start_run(db, p, "manual", clock.now(), llm)


@router.get("/{playbook_id}/runs", response_model=list[RunOut])
async def list_runs(playbook_id: uuid.UUID, user: CurrentUser, db: DB) -> list[PlaybookRun]:
    await _own(db, playbook_id, user)
    return list(
        await db.scalars(
            select(PlaybookRun)
            .where(PlaybookRun.playbook_id == playbook_id)
            .order_by(PlaybookRun.created_at.desc())
            .limit(50)
        )
    )


async def _run_and_playbook(db: DB, run_id: uuid.UUID) -> tuple[PlaybookRun, Playbook]:
    run = await db.get(PlaybookRun, run_id)
    p = await db.get(Playbook, run.playbook_id) if run else None
    if run is None or p is None:
        raise AppError("not_found", "Report not found", 404)
    return run, p


@router.get("/runs/{run_id}", response_model=ReportOut)
async def get_report(run_id: uuid.UUID, user: CurrentUser, db: DB) -> ReportOut:
    """The owner sees every report of the run; a recipient only sees their own, once delivered."""
    run, p = await _run_and_playbook(db, run_id)
    is_owner = p.owner_id == user.id
    mine = str(user.id)
    if not is_owner and (run.status != RunStatus.DELIVERED or mine not in run.outputs):
        raise AppError("not_found", "Report not found", 404)
    reports = run.outputs if is_owner else {mine: run.outputs[mine]}
    return ReportOut(
        run=RunOut.model_validate(run),
        playbook_name=p.name,
        is_owner=is_owner,
        reports={uuid.UUID(k): v for k, v in reports.items()},
    )


@router.post("/runs/{run_id}/approve", response_model=RunOut)
async def approve(run_id: uuid.UUID, user: CurrentUser, db: DB) -> PlaybookRun:
    run, p = await _run_and_playbook(db, run_id)
    if p.owner_id != user.id:
        raise AppError("not_found", "Report not found", 404)
    if run.status != RunStatus.AWAITING_APPROVAL:
        raise AppError("not_awaiting", "This report is not waiting for approval", 409)
    created = await deliver(db, run, p)
    audit.record(db, user.id, "playbook.approved", "playbook_run", run.id)
    await db.commit()
    await push(db, created)
    return run


@router.post("/runs/{run_id}/reject", response_model=RunOut)
async def reject(run_id: uuid.UUID, user: CurrentUser, db: DB) -> PlaybookRun:
    run, p = await _run_and_playbook(db, run_id)
    if p.owner_id != user.id:
        raise AppError("not_found", "Report not found", 404)
    if run.status != RunStatus.AWAITING_APPROVAL:
        raise AppError("not_awaiting", "This report is not waiting for approval", 409)
    run.status = RunStatus.REJECTED
    audit.record(db, user.id, "playbook.rejected", "playbook_run", run.id)
    await db.commit()
    return run
