from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.admin.router import router as admin_router
from app.ai.router import router as ai_router
from app.api import health, metrics, ws
from app.auth.router import router as auth_router
from app.calendar.router import router as calendar_router
from app.chat.channels import router as channels_router
from app.chat.router import router as chat_router
from app.core.csrf import register_csrf
from app.core.errors import register_error_handlers
from app.core.http import register_http_middleware
from app.core.logging import setup_logging
from app.core.scheduler import create_scheduler
from app.core.settings import get_settings
from app.files.router import router as files_router
from app.playbooks.router import router as playbooks_router
from app.projects.dashboard import router as dashboard_router
from app.projects.router import router as projects_router
from app.reminders.router import router as reminders_router
from app.requests.router import router as requests_router
from app.search.router import router as search_router
from app.tasks.router import router as tasks_router
from app.users.router import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    scheduler = create_scheduler() if get_settings().scheduler_enabled else None
    if scheduler:
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    public_docs = settings.environment != "production"  # no API browsing in production
    app = FastAPI(
        title=settings.app_name,
        openapi_url="/api/v1/openapi.json" if public_docs else None,
        docs_url="/api/docs" if public_docs else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    register_error_handlers(app)
    register_csrf(app)
    register_http_middleware(app)  # outermost: sees every response, including CSRF errors
    for router in (
        health.router,
        auth_router,
        users_router,
        admin_router,
        chat_router,
        channels_router,
        search_router,
        files_router,
        tasks_router,
        ai_router,
        reminders_router,
        playbooks_router,
        calendar_router,
        requests_router,
        projects_router,
        dashboard_router,
    ):
        app.include_router(router, prefix="/api/v1")
    app.include_router(ws.router)
    app.include_router(metrics.router)
    return app


app = create_app()
