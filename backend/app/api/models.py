from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.core.database import get_db
from app.core.auth import get_current_user_id
from app.models.models import Model as ModelDB, ModelStatus
from app.schemas.schemas import ModelCreate, ModelResponse, PresignedUrlResponse
from app.services.storage import storage_service
from app.services.file_names import model_download_filename, sanitize_filename
from app.services.resource_cleanup import (
    delete_related_analyses,
    delete_storage_files,
)
from app.core.config import settings
from starlette.concurrency import run_in_threadpool
import os

router = APIRouter()


@router.post("/upload-url", response_model=PresignedUrlResponse)
async def get_upload_url(
    model_type: str,
    current_user_id: UUID = Depends(get_current_user_id),
):
    """Generate presigned URL for model upload"""
    try:
        content_type = "application/octet-stream"
        # Include user_id in storage path for isolation
        upload_url, s3_key = storage_service.generate_presigned_upload_url(
            file_type=content_type,
            prefix=f"artifacts/models/{current_user_id}"
        )

        # For local storage, return API endpoint instead of file path
        if settings.STORAGE_MODE == "local":
            upload_url = f"/api/models/upload/{s3_key}"

        return PresignedUrlResponse(
            upload_url=upload_url,
            s3_key=s3_key,
            expires_in=3600,
            upload_method="POST" if settings.STORAGE_MODE == "local" else "PUT",
            content_type=content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {str(e)}")


@router.post("/upload/{s3_key:path}")
async def upload_file_direct(
    s3_key: str,
    file: UploadFile = File(...),
    current_user_id: UUID = Depends(get_current_user_id),
):
    """Direct file upload endpoint for local storage"""
    if settings.STORAGE_MODE != "local":
        raise HTTPException(status_code=404, detail="Local uploads are disabled")

    expected_prefix = f"artifacts/models/{current_user_id}/"
    if not s3_key.startswith(expected_prefix):
        raise HTTPException(status_code=403, detail="Invalid storage key")

    try:
        await run_in_threadpool(
            storage_service.save_uploaded_file,
            s3_key,
            file.file,
            settings.MAX_UPLOAD_SIZE_BYTES,
        )
        return {"status": "success"}
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/", response_model=ModelResponse)
async def create_model(
    model: ModelCreate,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Create model record after successful upload"""
    s3_key = model.s3_key
    expected_prefix = f"artifacts/models/{current_user_id}/"
    if not s3_key.startswith(expected_prefix):
        raise HTTPException(status_code=403, detail="Invalid storage key")

    try:
        file_size = storage_service.get_file_size(s3_key)
        if file_size is None:
            raise HTTPException(status_code=400, detail="Uploaded model file not found")

        db_model = ModelDB(
            user_id=current_user_id,
            name=model.name,
            description=model.description,
            model_type=model.model_type,
            s3_key=s3_key,
            original_filename=sanitize_filename(model.original_filename),
            file_size=file_size,
            status=ModelStatus.UPLOADED
        )

        db.add(db_model)
        db.commit()
        db.refresh(db_model)

        return db_model
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create model: {str(e)}")


@router.get("/", response_model=List[ModelResponse])
async def list_models(
    skip: int = 0,
    limit: int = 100,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """List all models for current user"""
    models = db.query(ModelDB).filter(
        ModelDB.user_id == current_user_id
    ).offset(skip).limit(limit).all()
    return models


@router.get("/{model_id}", response_model=ModelResponse)
async def get_model(
    model_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get model by ID (only if owned by current user)"""
    model = db.query(ModelDB).filter(
        ModelDB.id == model_id,
        ModelDB.user_id == current_user_id
    ).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.delete("/{model_id}")
async def delete_model(
    model_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Delete model (only if owned by current user)"""
    from app.models.models import Analysis

    model = db.query(ModelDB).filter(
        ModelDB.id == model_id,
        ModelDB.user_id == current_user_id
    ).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    try:
        analyses = db.query(Analysis).filter(Analysis.model_id == model_id).all()
        storage_keys = delete_related_analyses(db, analyses)
        storage_keys.append(model.s3_key)
        db.delete(model)
        db.commit()

        delete_storage_files(storage_keys)
        return {
            "message": "Модель удалена",
            "deleted_analyses": len(analyses),
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")


@router.get("/{model_id}/download")
async def download_model(
    model_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get download URL for model (only if owned by current user)"""
    model = db.query(ModelDB).filter(
        ModelDB.id == model_id,
        ModelDB.user_id == current_user_id
    ).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    try:
        model_type = getattr(model.model_type, "value", str(model.model_type))
        filename = model_download_filename(
            model.name,
            model_type,
            model.original_filename,
        )
        download_url = storage_service.generate_presigned_download_url(
            model.s3_key,
            filename=filename,
            content_type="application/octet-stream",
        )

        # For local storage, return API endpoint instead of file path
        if settings.STORAGE_MODE == "local":
            download_url = f"/api/models/download-file/{model.s3_key}"

        return {
            "download_url": download_url,
            "filename": filename,
            "file_size": model.file_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")


@router.get("/download-file/{s3_key:path}")
async def download_file_direct(
    s3_key: str,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Direct file download endpoint for local storage"""
    from fastapi.responses import FileResponse

    # Verify user owns this model
    model = db.query(ModelDB).filter(
        ModelDB.s3_key == s3_key,
        ModelDB.user_id == current_user_id
    ).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    try:
        file_path = storage_service.generate_presigned_download_url(s3_key)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        model_type = getattr(model.model_type, "value", str(model.model_type))
        filename = model_download_filename(
            model.name,
            model_type,
            model.original_filename,
        )
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='application/octet-stream'
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
