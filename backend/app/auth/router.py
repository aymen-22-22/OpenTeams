from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.admin import audit
from app.auth.deps import DB
from app.auth.providers import provider
from app.auth.schemas import LoginIn
from app.auth.service import end_session, start_session
from app.core.errors import AppError
from app.core.ratelimit import RateLimiter
from app.core.security import CSRF_COOKIE, SESSION_COOKIE, new_csrf_token
from app.core.settings import get_settings
from app.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

_settings = get_settings()
login_limiter = RateLimiter(_settings.login_max_attempts, _settings.login_window_seconds)


def _set_csrf_cookie(response: Response) -> None:
    # Readable by JavaScript on purpose: the frontend copies it into the X-CSRF-Token header.
    response.set_cookie(
        CSRF_COOKIE, new_csrf_token(), secure=get_settings().cookie_secure, samesite="strict"
    )


@router.get("/csrf", status_code=204)
async def csrf(response: Response) -> None:
    """Issue a CSRF token cookie. Call once before the first POST."""
    _set_csrf_cookie(response)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, db: DB) -> JSONResponse:
    ip = request.client.host if request.client else "unknown"
    key = f"{ip}:{body.email.lower()}"
    if not login_limiter.hit(key):
        raise AppError("rate_limited", "Too many login attempts, try again later", 429)

    user = await provider.authenticate(db, body.email, body.password)
    if user is None:
        audit.record(db, None, "auth.login_failed")
        await db.commit()
        raise AppError("invalid_credentials", "Invalid email or password", 401)

    login_limiter.reset(key)
    token, session = await start_session(db, user)
    audit.record(db, user.id, "auth.login", "session", session.id)
    await db.commit()

    response = JSONResponse(UserOut.model_validate(user).model_dump(mode="json"))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
        max_age=get_settings().session_days * 86400,
    )
    _set_csrf_cookie(response)  # rotate CSRF token on login
    return response


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DB) -> None:
    await end_session(db, request.cookies.get(SESSION_COOKIE))
    await db.commit()
    response.delete_cookie(SESSION_COOKIE)
