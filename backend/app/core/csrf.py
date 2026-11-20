"""Double-submit CSRF protection: unsafe requests must echo the csrf cookie in a header."""

import secrets
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

from app.core.errors import error_response
from app.core.security import CSRF_COOKIE, CSRF_HEADER

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def register_csrf(app: FastAPI) -> None:
    @app.middleware("http")
    async def csrf_check(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method not in SAFE_METHODS and request.url.path.startswith("/api/"):
            cookie = request.cookies.get(CSRF_COOKIE, "")
            header = request.headers.get(CSRF_HEADER, "")
            if not cookie or not secrets.compare_digest(cookie, header):
                return error_response(403, "csrf_failed", "Missing or invalid CSRF token")
        return await call_next(request)
