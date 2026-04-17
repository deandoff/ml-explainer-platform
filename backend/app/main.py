from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api import models, datasets, analyses

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ML Explainer Platform",
    description="Platform for explaining ML model predictions using SHAP and LIME",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(analyses.router, prefix="/api/analyses", tags=["analyses"])


@app.get("/")
async def root():
    return {"message": "ML Explainer Platform API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
