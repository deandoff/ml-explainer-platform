from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.models import Dataset as DatasetDB
from app.schemas.schemas import DatasetCreate, DatasetResponse, PresignedUrlResponse
from app.services.storage import storage_service
from app.core.config import settings
import pandas as pd
import tempfile
import os

router = APIRouter()


@router.post("/upload-url", response_model=PresignedUrlResponse)
async def get_upload_url(db: Session = Depends(get_db)):
    """Generate presigned URL for dataset upload"""
    try:
        upload_url, s3_key = storage_service.generate_presigned_upload_url(
            file_type="text/csv",
            prefix="artifacts/datasets"
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
        print(f"DEBUG: Uploading to {s3_key}, filename: {file.filename}, content_type: {file.content_type}")
        content = await file.read()
        print(f"DEBUG: File size: {len(content)} bytes")
        storage_service.save_uploaded_file(s3_key, content)
        print(f"DEBUG: File saved successfully")
        return {"status": "success"}
    except Exception as e:
        print(f"DEBUG: Upload failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
    dataset: DatasetCreate,
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
            num_rows, num_features = df.shape
            os.unlink(tmp_file.name)

        db_dataset = DatasetDB(
            name=dataset.name,
            description=dataset.description,
            s3_key=s3_key,
            file_size=file_size,
            num_rows=num_rows,
            num_features=num_features
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
    db: Session = Depends(get_db)
):
    """List all datasets"""
    datasets = db.query(DatasetDB).offset(skip).limit(limit).all()
    return datasets


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: int,
    db: Session = Depends(get_db)
):
    """Get dataset by ID"""
    dataset = db.query(DatasetDB).filter(DatasetDB.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: int,
    db: Session = Depends(get_db)
):
    """Delete dataset"""
    from app.models.models import Analysis

    dataset = db.query(DatasetDB).filter(DatasetDB.id == dataset_id).first()
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
