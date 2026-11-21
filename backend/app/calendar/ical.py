"""Minimal iCalendar (RFC 5545) writer: enough for Outlook, Google, Apple and Thunderbird."""

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from app.calendar.schemas import EventOut


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> list[str]:
    """Lines longer than 75 octets are folded (continuation lines start with a space)."""
    out, current = [], ""
    for ch in line:
        if len((current + ch).encode()) > 74:
            out.append(current)
            current = " " + ch
        else:
            current += ch
    return [*out, current]


def _utc(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def to_ical(events: Iterable[EventOut], calendar_name: str, now: datetime) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//OpenTeams//Calendar//FR",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{_escape(calendar_name)}",
    ]
    for e in events:
        lines += ["BEGIN:VEVENT", f"UID:{e.id}@openteams", f"DTSTAMP:{_utc(now)}"]
        if e.all_day:
            start = e.starts_at.date()
            end = max(e.ends_at.date(), start) + timedelta(days=1)  # DTEND is exclusive
            lines += [f"DTSTART;VALUE=DATE:{start:%Y%m%d}", f"DTEND;VALUE=DATE:{end:%Y%m%d}"]
        else:
            lines += [f"DTSTART:{_utc(e.starts_at)}", f"DTEND:{_utc(e.ends_at)}"]
        lines += [f"SUMMARY:{_escape(e.title)}", f"CATEGORIES:{e.type.value.upper()}"]
        if e.description:
            lines.append(f"DESCRIPTION:{_escape(e.description)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(folded for line in lines for folded in _fold(line)) + "\r\n"
