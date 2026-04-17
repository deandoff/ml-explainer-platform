from app.core.config import settings

# Import appropriate storage service based on configuration
if settings.STORAGE_MODE == "s3":
    from app.services.s3_service import s3_service as storage_service
else:
    from app.services.local_storage_service import local_storage_service as storage_service

__all__ = ["storage_service"]
