from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class ModelStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ExplainerType(str, Enum):
    SHAP = "shap"
    LIME = "lime"


# Model schemas
class ModelBase(BaseModel):
    name: str
    description: Optional[str] = None
    model_type: str


class ModelCreate(ModelBase):
    s3_key: str


class ModelResponse(ModelBase):
    id: int
    s3_key: str
    file_size: Optional[int] = None
    status: ModelStatus
    created_at: datetime

    class Config:
        from_attributes = True


# Dataset schemas
class DatasetBase(BaseModel):
    name: str
    description: Optional[str] = None


class DatasetCreate(DatasetBase):
    s3_key: str


class DatasetResponse(DatasetBase):
    id: int
    s3_key: str
    file_size: Optional[int] = None
    num_rows: Optional[int] = None
    num_features: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Analysis schemas
class AnalysisCreate(BaseModel):
    model_id: int
    dataset_id: int
    explainer_type: ExplainerType


class AnalysisResponse(BaseModel):
    id: int
    model_id: int
    dataset_id: int
    explainer_type: str
    status: AnalysisStatus
    result_s3_key: Optional[str] = None
    celery_task_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Upload schemas
class PresignedUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int = 3600
