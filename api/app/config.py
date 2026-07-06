import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    runnr_secret_key: str = "change-me-in-railway"
    runnr_encryption_key: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    finnhub_api_key: str = ""
    quote_cache_ttl: int = 45
    quote_stale_ttl: int = 300
    fear_greed_cache_ttl: int = 900
    brief_refresh_cooldown_s: int = 3600
    database_path: str = os.environ.get("DATABASE_PATH", "/data/runnr.db")
    cors_origins: str = (
        "http://localhost:8080,"
        "https://6tbwmzr522-crypto.github.io,"
        "https://runnr.fyi,"
        "https://www.runnr.fyi"
    )

    @property
    def origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
