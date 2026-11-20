from fastapi import FastAPI

from app.api import health
from app.core.errors import register_error_handlers
from app.core.logging import setup_logging
from app.core.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, openapi_url="/api/v1/openapi.json", docs_url="/api/docs")
    register_error_handlers(app)
    app.include_router(health.router, prefix="/api/v1")
    return app


app = create_app()
