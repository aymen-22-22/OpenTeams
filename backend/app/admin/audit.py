import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.models import AuditLog


def record(
    db: AsyncSession,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    **details: Any,
) -> None:
    """Add an audit entry to the current transaction (committed by the caller)."""
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
        )
    )
