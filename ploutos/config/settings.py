from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Ploutos"

    # CORS Settings
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]


settings = Settings()
