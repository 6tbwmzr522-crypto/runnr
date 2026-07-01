import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    runnr_secret_key: str = "change-me-in-railway"
    runnr_encryption_key: str = ""
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
