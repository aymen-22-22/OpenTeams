"""Authentication provider interface. Local accounts today; Active Directory/LDAP later."""

from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.users.models import User


class AuthProvider(Protocol):
    async def authenticate(self, db: AsyncSession, email: str, password: str) -> User | None: ...


class LocalProvider:
    async def authenticate(self, db: AsyncSession, email: str, password: str) -> User | None:
        return await service.authenticate(db, email, password)


# An LdapProvider implementing AuthProvider will be added when LDAP is configured.
provider: AuthProvider = LocalProvider()
