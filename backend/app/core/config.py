from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str

    # Storage mode: "s3" or "local"
    STORAGE_MODE: str = "local"

    # S3 Storage (optional, only if STORAGE_MODE=s3)
    S3_ENDPOINT_URL: Optional[str] = None
    S3_ACCESS_KEY_ID: Optional[str] = None
    S3_SECRET_ACCESS_KEY: Optional[str] = None
    S3_BUCKET_NAME: Optional[str] = None
    S3_REGION: str = "ru-central1"

    # Local Storage (used if STORAGE_MODE=local)
    LOCAL_STORAGE_PATH: str = "./storage"

    # Backend
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    SECRET_KEY: str

    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    # Environment
    ENVIRONMENT: str = "development"

    # CORS
    CORS_ORIGINS: list = ["http://localhost:3000"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
