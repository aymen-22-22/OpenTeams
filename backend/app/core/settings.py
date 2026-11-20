from functools import lru_cache

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

    login_max_attempts: int = 5
    login_window_seconds: int = 300

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> "Settings":
        if self.environment == "production" and (
            self.secret_key == DEV_SECRET or len(self.secret_key) < 32
        ):
            raise ValueError("SECRET_KEY must be set to a random value of 32+ characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
