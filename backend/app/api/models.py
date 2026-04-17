from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.models import Model as ModelDB, ModelStatus
from app.schemas.schemas import ModelCreate, ModelResponse, PresignedUrlResponse
from app.services.storage import storage_service
from app.core.config import settings

router = APIRouter()


@router.post("/upload-url", response_model=PresignedUrlResponse)
async def get_upload_url(
    model_type: str,
    db: Session = Depends(get_db)
):
    """Generate presigned URL for model upload"""
    try:
        upload_url, s3_key = storage_service.generate_presigned_upload_url(
            file_type="application/octet-stream",
            prefix=f"artifacts/models"
        )

        # For local storage, return API endpoint instead of file path
        if settings.STORAGE_MODE == "local":
            upload_url = f"http://localhost:8000/api/models/upload/{s3_key}"

        return PresignedUrlResponse(
            upload_url=upload_url,
            s3_key=s3_key,
            expires_in=3600
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {str(e)}")


@router.post("/upload/{s3_key:path}")
async def upload_file_direct(s3_key: str, file: UploadFile = File(...)):
    """Direct file upload endpoint for local storage"""
    try:
        content = await file.read()
        storage_service.save_uploaded_file(s3_key, content)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/", response_model=ModelResponse)
async def create_model(
    model: ModelCreate,
    db: Session = Depends(get_db)
):
    """Create model record after successful upload"""
    s3_key = model.s3_key
    try:
        file_size = storage_service.get_file_size(s3_key)

        db_model = ModelDB(
            name=model.name,
            description=model.description,
            model_type=model.model_type,
            s3_key=s3_key,
            file_size=file_size,
            status=ModelStatus.UPLOADED
        )

        db.add(db_model)
        db.commit()
        db.refresh(db_model)

        return db_model
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create model: {str(e)}")


@router.get("/", response_model=List[ModelResponse])
async def list_models(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all models"""
    models = db.query(ModelDB).offset(skip).limit(limit).all()
    return models


@router.get("/{model_id}", response_model=ModelResponse)
async def get_model(
    model_id: int,
    db: Session = Depends(get_db)
):
    """Get model by ID"""
    model = db.query(ModelDB).filter(ModelDB.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.delete("/{model_id}")
async def delete_model(
    model_id: int,
    db: Session = Depends(get_db)
):
    """Delete model"""
    from app.models.models import Analysis

    model = db.query(ModelDB).filter(ModelDB.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Check if model is used in analyses
    analyses_count = db.query(Analysis).filter(Analysis.model_id == model_id).count()
    if analyses_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete model: it is used in {analyses_count} analysis/analyses"
        )

    try:
        # Delete from storage
        storage_service.delete_file(model.s3_key)

        # Delete from database
        db.delete(model)
        db.commit()

        return {"message": "Model deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")
