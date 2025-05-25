from functools import lru_cache

from pydantic.types import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Ploutos"

    # CORS Settings
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Database Settings
    supabase_url: str
    supabase_secret: SecretStr


@lru_cache()
def get_settings() -> Settings:
    """Retourne les paramètres de configuration."""
    return Settings()
