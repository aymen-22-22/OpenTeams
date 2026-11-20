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

    # Personal AI. AI_ENCRYPTION_KEY is a Fernet key; if empty it is derived from SECRET_KEY.
    ai_encryption_key: str = ""
    ai_timeout_seconds: int = 60
    ai_daily_token_budget: int = 200_000  # per owner
    ai_caller_per_minute: int = 10
    ai_owner_per_hour: int = 120
    ollama_url: str = "http://ollama:11434"
    qwen_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    timezone: str = "Europe/Paris"

    # Public address of the app, used for links in emails.
    app_url: str = "https://localhost"
    scheduler_enabled: bool = True
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    mail_from: str = "OpenTeams <no-reply@openteams.local>"

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
