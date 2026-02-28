from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_url: str = "http://localhost:8000"
    auth_token: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
