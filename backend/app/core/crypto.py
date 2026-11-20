"""Encryption at rest for secrets such as users' AI API keys (Fernet: AES + HMAC)."""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.settings import get_settings


@lru_cache
def _fernet() -> Fernet:
    s = get_settings()
    key = (
        s.ai_encryption_key
        or base64.urlsafe_b64encode(
            hashlib.sha256(f"ai-keys:{s.secret_key}".encode()).digest()
        ).decode()
    )
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
