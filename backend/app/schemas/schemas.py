from pydantic import BaseModel, UUID4, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum


# Auth schemas
class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID4
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


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


class ModelType(str, Enum):
    SKLEARN = "sklearn"
    XGBOOST = "xgboost"
    LIGHTGBM = "lightgbm"
    CATBOOST = "catboost"
    PYTORCH = "pytorch"
    TENSORFLOW = "tensorflow"
    ONNX = "onnx"


# Model schemas
class ModelBase(BaseModel):
    name: str
    description: Optional[str] = None
    model_type: ModelType


class ModelCreate(ModelBase):
    s3_key: str


class ModelResponse(ModelBase):
    id: UUID4
    user_id: UUID4
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
    id: UUID4
    user_id: UUID4
    s3_key: str
    file_size: Optional[int] = None
    num_rows: Optional[int] = None
    num_columns: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Analysis schemas
class AnalysisCreate(BaseModel):
    model_id: UUID4
    dataset_id: UUID4
    explainer_type: ExplainerType


class AnalysisResponse(BaseModel):
    id: UUID4
    user_id: UUID4
    model_id: UUID4
    dataset_id: UUID4
    method: ExplainerType
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
