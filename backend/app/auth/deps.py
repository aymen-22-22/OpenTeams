from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import user_from_token
from app.core.db import get_session
from app.core.errors import AppError
from app.core.security import SESSION_COOKIE
from app.users.models import Role, User

DB = Annotated[AsyncSession, Depends(get_session)]


async def current_user(request: Request, db: DB) -> User:
    user = await user_from_token(db, request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise AppError("not_authenticated", "Authentication required", 401)
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(*roles: Role) -> Callable[[User], Coroutine[Any, Any, User]]:
    async def check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise AppError("forbidden", "You do not have permission to do this", 403)
        return user

    return check


AdminUser = Annotated[User, Depends(require_role(Role.ADMIN))]
