import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.settings import get_settings

_hasher = PasswordHasher()
_ALGORITHM = "HS256"

SESSION_COOKIE = "session"
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


# Used when the email is unknown, so login takes the same time either way.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


@dataclass(frozen=True)
class TokenClaims:
    user_id: uuid.UUID
    session_id: uuid.UUID


def create_session_token(user_id: uuid.UUID, session_id: uuid.UUID, expires_at: datetime) -> str:
    payload = {"sub": str(user_id), "sid": str(session_id), "exp": expires_at}
    return jwt.encode(payload, get_settings().secret_key, algorithm=_ALGORITHM)


def decode_session_token(token: str, now: datetime) -> TokenClaims | None:
    try:
        payload = jwt.decode(
            token,
            get_settings().secret_key,
            algorithms=[_ALGORITHM],
            options={"verify_exp": False},  # expiry checked below with our clock
        )
        if payload["exp"] <= now.timestamp():
            return None
        return TokenClaims(uuid.UUID(payload["sub"]), uuid.UUID(payload["sid"]))
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)
