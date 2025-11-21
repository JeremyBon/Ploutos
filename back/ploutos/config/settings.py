from functools import lru_cache

from pydantic.types import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Ploutos"

    # CORS Settings
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Database Settings
    supabase_url: str
    supabase_secret: SecretStr
    GO_CARDLESS_SECRET_ID: SecretStr
    GO_CARDLESS_SECRET_KEY: SecretStr
    ENCRYPTION_KEY: SecretStr

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
