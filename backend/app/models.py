"""Import every model here so Alembic sees them all."""

from app.users.models import User

__all__ = ["User"]
