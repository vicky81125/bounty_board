from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str
    database_migration_url: str

    # Security — CSRF signing + HMAC token signing (NOT used for JWTs)
    secret_key: str

    # CORS
    allowed_origins: list[str]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    # Session cookies
    session_cookie_name: str = "bounty_session"
    session_duration_days: int = 30
    session_activity_update_interval_seconds: int = 60
    cookie_secure: bool = True
    session_samesite: Literal["lax", "strict", "none"] = "lax"
    session_domain: str | None = None

    # CSRF
    csrf_token_header: str = "X-CSRF-Token"
    csrf_cookie_name: str = "csrf_token"
    csrf_enabled: bool = True

    # Supabase (Storage only — DB access via asyncpg directly)
    supabase_url: str
    supabase_service_role_key: str

    # Environment
    environment: Literal["development", "staging", "production"] = "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def api_prefix(self) -> str:
        return "/api"


@lru_cache
def get_settings() -> Settings:
    return Settings()
