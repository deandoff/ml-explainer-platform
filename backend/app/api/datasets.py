from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.core.database import get_db
from app.core.auth import get_current_user_id
from app.models.models import Dataset as DatasetDB
from app.schemas.schemas import DatasetCreate, DatasetResponse, PresignedUrlResponse
from app.services.storage import storage_service
from app.core.config import settings
import pandas as pd
import tempfile
import os

router = APIRouter()


@router.post("/upload-url", response_model=PresignedUrlResponse)
async def get_upload_url(
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Generate presigned URL for dataset upload"""
    try:
        # Include user_id in storage path for isolation
        upload_url, s3_key = storage_service.generate_presigned_upload_url(
            file_type="text/csv",
            prefix=f"artifacts/datasets/{current_user_id}"
        )

        # For local storage, return API endpoint instead of file path
        if settings.STORAGE_MODE == "local":
            upload_url = f"http://localhost:8000/api/datasets/upload/{s3_key}"

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


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
    dataset: DatasetCreate,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Create dataset record after successful upload"""
    s3_key = dataset.s3_key
    try:
        file_size = storage_service.get_file_size(s3_key)

        # Download and analyze dataset
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp_file:
            storage_service.download_file(s3_key, tmp_file.name)
            df = pd.read_csv(tmp_file.name)
            num_rows, num_columns = df.shape
            column_names = df.columns.tolist()
            os.unlink(tmp_file.name)

        db_dataset = DatasetDB(
            user_id=current_user_id,
            name=dataset.name,
            description=dataset.description,
            s3_key=s3_key,
            file_size=file_size,
            num_rows=num_rows,
            num_columns=num_columns,
            column_names=column_names
        )

        db.add(db_dataset)
        db.commit()
        db.refresh(db_dataset)

        return db_dataset
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create dataset: {str(e)}")


@router.get("/", response_model=List[DatasetResponse])
async def list_datasets(
    skip: int = 0,
    limit: int = 100,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """List all datasets for current user"""
    datasets = db.query(DatasetDB).filter(
        DatasetDB.user_id == current_user_id
    ).offset(skip).limit(limit).all()
    return datasets


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get dataset by ID (only if owned by current user)"""
    dataset = db.query(DatasetDB).filter(
        DatasetDB.id == dataset_id,
        DatasetDB.user_id == current_user_id
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Delete dataset (only if owned by current user)"""
    from app.models.models import Analysis

    dataset = db.query(DatasetDB).filter(
        DatasetDB.id == dataset_id,
        DatasetDB.user_id == current_user_id
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Check if dataset is used in analyses
    analyses_count = db.query(Analysis).filter(Analysis.dataset_id == dataset_id).count()
    if analyses_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete dataset: it is used in {analyses_count} analysis/analyses"
        )

    try:
        storage_service.delete_file(dataset.s3_key)
        db.delete(dataset)
        db.commit()

        return {"message": "Dataset deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {str(e)}")


@router.get("/{dataset_id}/download")
async def download_dataset(
    dataset_id: UUID,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get download URL for dataset (only if owned by current user)"""
    dataset = db.query(DatasetDB).filter(
        DatasetDB.id == dataset_id,
        DatasetDB.user_id == current_user_id
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        download_url = storage_service.generate_presigned_download_url(dataset.s3_key)

        # For local storage, return API endpoint instead of file path
        if settings.STORAGE_MODE == "local":
            download_url = f"http://localhost:8000/api/datasets/download-file/{dataset.s3_key}"

        return {
            "download_url": download_url,
            "filename": dataset.name,
            "file_size": dataset.file_size
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

    # Verify user owns this dataset
    dataset = db.query(DatasetDB).filter(
        DatasetDB.s3_key == s3_key,
        DatasetDB.user_id == current_user_id
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        file_path = storage_service.generate_presigned_download_url(s3_key)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=file_path,
            filename=dataset.name,
            media_type='text/csv'
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
