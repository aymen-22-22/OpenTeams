from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Session
from app.core import clock
from app.core.security import (
    DUMMY_HASH,
    create_session_token,
    decode_session_token,
    verify_password,
)
from app.core.settings import get_settings
from app.users.models import User


async def authenticate(db: AsyncSession, email: str, password: str) -> User | None:
    """Local provider: check email and password. Same cost whether the email exists or not."""
    user = await db.scalar(select(User).where(func.lower(User.email) == email.lower()))
    if user is None:
        verify_password(DUMMY_HASH, password)
        return None
    if not verify_password(user.password_hash, password) or not user.is_active:
        return None
    return user


async def start_session(db: AsyncSession, user: User) -> tuple[str, Session]:
    expires_at = clock.now() + timedelta(days=get_settings().session_days)
    session = Session(user_id=user.id, expires_at=expires_at)
    db.add(session)
    await db.flush()
    return create_session_token(user.id, session.id, expires_at), session


async def user_from_token(db: AsyncSession, token: str | None) -> User | None:
    """Resolve a session cookie to an active user, or None if invalid, expired or revoked."""
    if not token:
        return None
    now = clock.now()
    claims = decode_session_token(token, now)
    if claims is None:
        return None
    session = await db.get(Session, claims.session_id)
    if (
        session is None
        or session.user_id != claims.user_id
        or session.revoked_at is not None
        or session.expires_at <= now
    ):
        return None
    user = await db.get(User, claims.user_id)
    return user if user is not None and user.is_active else None


async def end_session(db: AsyncSession, token: str | None) -> None:
    claims = decode_session_token(token, clock.now()) if token else None
    if claims is None:
        return
    session = await db.get(Session, claims.session_id)
    if session is not None and session.revoked_at is None:
        session.revoked_at = clock.now()
