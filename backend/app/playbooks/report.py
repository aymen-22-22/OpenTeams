"""Collects task data with the owner's permissions and renders a plain report."""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.playbooks.models import Playbook, PlaybookKind
from app.tasks.access import visible_tasks
from app.tasks.models import Task, TaskStatus
from app.users.models import Role, User

LABELS: dict[str, dict[str, Any]] = {
    "fr": {
        "title": {
            "task_summary": "Résumé des tâches",
            "weekly_report": "Rapport hebdomadaire",
            "monthly_report": "Rapport mensuel",
            "monday_summary": "Résumé du lundi",
        },
        "period": "Période",
        "finished": "Terminées",
        "in_progress": "En cours",
        "pending": "En attente",
        "overdue": "En retard",
        "per_person": "Par personne",
        "per_project": "Par projet",
        "mine": "Vos tâches ouvertes",
        "team": "Équipe",
        "none": "Rien à signaler.",
        "due": "échéance",
    },
    "en": {
        "title": {
            "task_summary": "Task summary",
            "weekly_report": "Weekly report",
            "monthly_report": "Monthly report",
            "monday_summary": "Monday summary",
        },
        "period": "Period",
        "finished": "Finished",
        "in_progress": "In progress",
        "pending": "Pending",
        "overdue": "Overdue",
        "per_person": "Per person",
        "per_project": "Per project",
        "mine": "Your open tasks",
        "team": "Team",
        "none": "Nothing to report.",
        "due": "due",
    },
    "ar": {
        "title": {
            "task_summary": "ملخص المهام",
            "weekly_report": "التقرير الأسبوعي",
            "monthly_report": "التقرير الشهري",
            "monday_summary": "ملخص يوم الاثنين",
        },
        "period": "الفترة",
        "finished": "منتهية",
        "in_progress": "قيد التنفيذ",
        "pending": "قيد الانتظار",
        "overdue": "متأخرة",
        "per_person": "حسب الشخص",
        "per_project": "حسب المشروع",
        "mine": "مهامك المفتوحة",
        "team": "الفريق",
        "none": "لا شيء للإبلاغ عنه.",
        "due": "الاستحقاق",
    },
}


@dataclass
class TaskData:
    finished: list[Task] = field(default_factory=list)
    in_progress: list[Task] = field(default_factory=list)
    pending: list[Task] = field(default_factory=list)
    overdue: list[Task] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        return {k: len(getattr(self, k)) for k in ("finished", "in_progress", "pending", "overdue")}


async def collect(
    db: AsyncSession,
    owner: User,
    scope: list[uuid.UUID],
    start: datetime,
    end: datetime,
    today: date,
) -> TaskData:
    """Only tasks the owner may see (same rule as the board), optionally limited to `scope`."""
    query = visible_tasks(owner)
    if scope:
        query = query.where(Task.assignee_id.in_(scope))
    data = TaskData()
    for t in await db.scalars(query.order_by(Task.due_date.nulls_last(), Task.title)):
        if t.status == TaskStatus.FINISHED:
            if t.finished_at and start <= t.finished_at <= end:
                data.finished.append(t)
            continue
        (data.in_progress if t.status == TaskStatus.IN_PROGRESS else data.pending).append(t)
        if t.due_date and t.due_date < today:
            data.overdue.append(t)
    return data


def _line(t: Task, names: dict[uuid.UUID, str], lang: str) -> str:
    who = names.get(t.assignee_id, "?") if t.assignee_id else "?"
    due = f" ({LABELS[lang]['due']} {t.due_date})" if t.due_date else ""
    return f"- {t.title} — {who}{due}"


def render(
    p: Playbook,
    data: TaskData,
    names: dict[uuid.UUID, str],
    start: datetime,
    end: datetime,
    lang: str,
    personal: bool = False,
    projects: dict[uuid.UUID, str] | None = None,
) -> str:
    L = LABELS.get(lang, LABELS["fr"])
    lines = [L["title"][p.kind.value], f"{L['period']}: {start.date()} → {end.date()}", ""]
    if personal:  # Monday summary for one person
        open_tasks = data.in_progress + data.pending
        lines.append(f"{L['mine']} ({len(open_tasks)})")
        lines += [_line(t, names, lang) for t in open_tasks] or [L["none"]]
        return "\n".join(lines)

    for key in ("finished", "in_progress", "pending", "overdue"):
        tasks = getattr(data, key)
        lines.append(f"{L[key]} ({len(tasks)})")
        lines += [_line(t, names, lang) for t in tasks[:30]]
        lines.append("")
    if p.kind in (PlaybookKind.WEEKLY_REPORT, PlaybookKind.MONTHLY_REPORT):
        lines.append(L["per_person"])
        people: dict[str, dict[str, int]] = {}
        for key in ("finished", "in_progress", "pending", "overdue"):
            for t in getattr(data, key):
                who = names.get(t.assignee_id, "?") if t.assignee_id else "?"
                people.setdefault(who, {}).setdefault(key, 0)
                people[who][key] += 1
        for who, c in sorted(people.items()):
            parts = ", ".join(
                f"{L[k]} {c.get(k, 0)}" for k in ("finished", "in_progress", "overdue")
            )
            lines.append(f"- {who}: {parts}")
        by_project: dict[str, dict[str, int]] = {}
        for key in ("finished", "in_progress", "pending", "overdue"):
            for t in getattr(data, key):
                if t.project_id and projects and t.project_id in projects:
                    c = by_project.setdefault(projects[t.project_id], {})
                    c[key] = c.get(key, 0) + 1
        if by_project:
            lines += ["", L["per_project"]]
            for name, c in sorted(by_project.items()):
                parts = ", ".join(
                    f"{L[k]} {c.get(k, 0)}" for k in ("finished", "in_progress", "overdue")
                )
                lines.append(f"- {name}: {parts}")
    return "\n".join(lines).strip()


def sees_team(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.MANAGER)
