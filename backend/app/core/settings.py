from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me-in-production"


class Settings(BaseSettings):
    """Application settings, read from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "OpenTeams"
    environment: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://openteams:openteams@localhost:5432/openteams"

    secret_key: str = DEV_SECRET
    session_days: int = 7
    cookie_secure: bool = True
    allowed_origins: list[str] = ["https://localhost", "http://localhost:5173"]

    storage_backend: Literal["local", "nextcloud"] = "local"
    local_storage_dir: str = "./data/files"
    nextcloud_url: str = ""
    nextcloud_user: str = ""
    nextcloud_app_password: str = ""
    nextcloud_folder: str = "OpenTeams"
    max_upload_mb: int = 100
    download_url_seconds: int = 300

    login_max_attempts: int = 5
    login_window_seconds: int = 300

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> "Settings":
        if self.environment == "production" and (
            self.secret_key == DEV_SECRET or len(self.secret_key) < 32
        ):
            raise ValueError("SECRET_KEY must be set to a random value of 32+ characters")
        if self.storage_backend == "nextcloud" and not (
            self.nextcloud_url and self.nextcloud_user and self.nextcloud_app_password
        ):
            raise ValueError(
                "NEXTCLOUD_URL, NEXTCLOUD_USER and NEXTCLOUD_APP_PASSWORD are required"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
