from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "OpenTeams"
    environment: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://openteams:openteams@localhost:5432/openteams"


@lru_cache
def get_settings() -> Settings:
    return Settings()
