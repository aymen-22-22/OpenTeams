"""Single source of time, so tests can control it (see tests/conftest.py)."""

from collections.abc import Callable
from datetime import UTC, datetime


def _system_now() -> datetime:
    return datetime.now(UTC)


_now: Callable[[], datetime] = _system_now


def now() -> datetime:
    return _now()


def set_clock(fn: Callable[[], datetime] | None) -> None:
    global _now
    _now = fn or _system_now
