"""When a playbook runs next, and which period its report covers. Pure functions."""

import calendar
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.settings import get_settings
from app.playbooks.models import Frequency, Playbook, PlaybookKind


def _tz() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def next_run(p: Playbook, after: datetime) -> datetime:
    """First scheduled time strictly after `after`."""
    local = after.astimezone(_tz())
    day = local.date()
    for _ in range(400):
        candidate = datetime.combine(day, time(p.hour), _tz())
        matches = (
            p.frequency == Frequency.DAILY
            or (p.frequency == Frequency.WEEKLY and day.weekday() == p.weekday)
            or (
                p.frequency == Frequency.MONTHLY
                and day.day == min(p.day_of_month, calendar.monthrange(day.year, day.month)[1])
            )
        )
        if matches and candidate > local:
            return candidate
        day += timedelta(days=1)
    raise ValueError("no next run found")


def period(p: Playbook, now: datetime) -> tuple[datetime, datetime]:
    """The time span a report covers, ending now."""
    local = now.astimezone(_tz())
    today = datetime.combine(local.date(), time(0), _tz())
    if p.kind == PlaybookKind.MONTHLY_REPORT or p.frequency == Frequency.MONTHLY:
        start = (
            today.replace(day=1) if local.day > 1 else (today - timedelta(days=1)).replace(day=1)
        )
        return start, now
    if p.kind in (PlaybookKind.WEEKLY_REPORT, PlaybookKind.MONDAY_SUMMARY) or (
        p.frequency == Frequency.WEEKLY
    ):
        return today - timedelta(days=7), now
    return today - timedelta(days=1), now
