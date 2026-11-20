from fastapi import FastAPI

from app.admin.router import router as admin_router
from app.ai.router import router as ai_router
from app.api import health, ws
from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.core.csrf import register_csrf
from app.core.errors import register_error_handlers
from app.core.logging import setup_logging
from app.core.settings import get_settings
from app.files.router import router as files_router
from app.search.router import router as search_router
from app.tasks.router import router as tasks_router
from app.users.router import router as users_router


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, openapi_url="/api/v1/openapi.json", docs_url="/api/docs")
    register_error_handlers(app)
    register_csrf(app)
    for router in (
        health.router,
        auth_router,
        users_router,
        admin_router,
        chat_router,
        search_router,
        files_router,
        tasks_router,
        ai_router,
    ):
        app.include_router(router, prefix="/api/v1")
    app.include_router(ws.router)
    return app


app = create_app()
