from typing import BinaryIO, Optional, Tuple
from pathlib import Path
import uuid
import shutil
from app.core.config import settings


class LocalStorageService:
    """Local filesystem storage as S3 alternative for development"""

    def __init__(self, base_path: str = "./storage"):
        self.base_path = Path(base_path).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve_key(self, storage_key: str) -> Path:
        file_path = (self.base_path / storage_key).resolve()
        if not file_path.is_relative_to(self.base_path):
            raise ValueError("Invalid storage key")
        return file_path

    def generate_presigned_upload_url(
        self,
        file_type: str,
        prefix: str = "uploads",
        expires_in: int = 3600
    ) -> Tuple[str, str]:
        """
        Generate local path for upload (mimics S3 presigned URL)

        Returns:
            tuple: (local_path, storage_key)
        """
        file_id = str(uuid.uuid4())
        storage_key = f"{prefix}/{file_id}"
        local_path = self._resolve_key(storage_key)

        # Create directory
        local_path.parent.mkdir(parents=True, exist_ok=True)

        # Return path as "upload URL"
        return str(local_path), storage_key

    def generate_presigned_download_url(
        self,
        storage_key: str,
        expires_in: int = 3600
    ) -> str:
        """Generate local path for download"""
        return str(self._resolve_key(storage_key))

    def download_file(self, storage_key: str, local_path: str):
        """Copy file from storage to local path"""
        source = self._resolve_key(storage_key)
        shutil.copy2(source, local_path)

    def upload_file(self, local_path: str, storage_key: str):
        """Copy file from local path to storage"""
        destination = self._resolve_key(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_path, destination)

    def delete_file(self, storage_key: str):
        """Delete file from storage"""
        file_path = self._resolve_key(storage_key)
        if file_path.exists():
            file_path.unlink()

    def get_file_size(self, storage_key: str) -> Optional[int]:
        """Get file size in bytes"""
        file_path = self._resolve_key(storage_key)
        if file_path.exists():
            return file_path.stat().st_size
        return None

    def save_uploaded_file(
        self,
        storage_key: str,
        file_object: BinaryIO,
        max_size_bytes: int,
    ) -> int:
        """Stream an uploaded file to storage while enforcing a size limit."""
        file_path = self._resolve_key(storage_key)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        bytes_written = 0

        try:
            with file_path.open("wb") as destination:
                while chunk := file_object.read(1024 * 1024):
                    bytes_written += len(chunk)
                    if bytes_written > max_size_bytes:
                        raise ValueError("Uploaded file exceeds the configured size limit")
                    destination.write(chunk)
        except Exception:
            file_path.unlink(missing_ok=True)
            raise

        return bytes_written

local_storage_service = LocalStorageService(settings.LOCAL_STORAGE_PATH)
