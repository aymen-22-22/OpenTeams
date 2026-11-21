"""HTTP middleware: security headers, request logging without secrets, Prometheus metrics."""

import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from prometheus_client import Counter, Histogram

logger = logging.getLogger("openteams.http")

REQUESTS = Counter("openteams_http_requests_total", "HTTP requests", ["method", "route", "status"])
LATENCY = Histogram(
    "openteams_http_request_seconds",
    "HTTP request duration",
    ["method", "route"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    # API responses are JSON or downloads: nothing in them may run as a page.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


def route_template(request: Request) -> str:
    """Route pattern (e.g. /api/v1/tasks/{task_id}), never the real path (it may hold tokens).

    Each path parameter value is replaced by its name; unknown URLs are grouped as "unmatched".
    """
    if request.scope.get("route") is None:
        return "unmatched"
    path = request.url.path
    for name, value in request.path_params.items():
        path = path.replace(f"/{value}", f"/{{{name}}}")
    return path


def register_http_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def observe(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - started
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        route = route_template(request)
        if route != "/metrics":
            REQUESTS.labels(request.method, route, str(response.status_code)).inc()
            LATENCY.labels(request.method, route).observe(elapsed)
            # No query string, no real path, no user data: only the route pattern.
            logger.info(
                "%s %s %s %.0fms", request.method, route, response.status_code, elapsed * 1000
            )
        return response
