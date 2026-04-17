from sqlalchemy import Column, String, Integer, DateTime, Text, Enum, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class ModelStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class AnalysisStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Model(Base):
    __tablename__ = "models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    model_type = Column(String)  # sklearn, xgboost, pytorch, tensorflow, onnx
    s3_key = Column(String, nullable=False)  # Path in S3
    file_size = Column(Integer)  # bytes
    status = Column(Enum(ModelStatus), default=ModelStatus.UPLOADED)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    analyses = relationship("Analysis", back_populates="model")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    s3_key = Column(String, nullable=False)
    file_size = Column(Integer)
    num_rows = Column(Integer)
    num_features = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(Integer, ForeignKey("models.id"))
    dataset_id = Column(Integer, ForeignKey("datasets.id"))
    explainer_type = Column(String)  # shap, lime
    status = Column(Enum(AnalysisStatus), default=AnalysisStatus.PENDING)
    result_s3_key = Column(String)  # Path to cached results in S3
    celery_task_id = Column(String)  # Celery task ID for tracking
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))

    model = relationship("Model", back_populates="analyses")
    dataset = relationship("Dataset")
