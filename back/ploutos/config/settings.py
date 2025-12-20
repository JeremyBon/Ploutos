import os
from functools import lru_cache
from typing import Literal

from pydantic.types import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


def _get_env_file() -> str | tuple[str, ...]:
    """Détermine le fichier .env à charger selon l'environnement.

    - ENV=local (défaut) → charge .env.local (Supabase self-hosted)
    - ENV=prod → charge .env (Supabase Cloud)
    """
    env = os.getenv("ENV", "local")
    if env == "local":
        # En local, on charge .env.local en priorité, avec fallback sur .env
        return (".env.local", ".env")
    # En prod, on charge uniquement .env
    return ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_get_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore les variables non définies dans le modèle
    )

    # Environment
    ENV: Literal["local", "prod"] = "local"

    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Ploutos"
    API_PORT: int = 8080

    # CORS Settings
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Database Settings
    supabase_url: str
    supabase_secret: SecretStr
    GO_CARDLESS_SECRET_ID: SecretStr
    GO_CARDLESS_SECRET_KEY: SecretStr
    ENCRYPTION_KEY: SecretStr

    @property
    def is_local(self) -> bool:
        """Retourne True si l'environnement est local."""
        return self.ENV == "local"

    def get_encryption_key_bytes(self) -> bytes:
        """Retourne la clé de chiffrement en bytes."""
        key_hex = self.ENCRYPTION_KEY.get_secret_value()
        try:
            return bytes.fromhex(key_hex)
        except ValueError:
            raise ValueError(
                "ENCRYPTION_KEY doit être une chaîne hexadécimale valide (64 caractères)."
            )


@lru_cache()
def get_settings() -> Settings:
    """Retourne les paramètres de configuration."""
    return Settings()  # type: ignore[call-arg]  # pyright: ignore[reportCallIssue]  # Pydantic loads from .env
