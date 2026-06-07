from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine
from app.api import models, datasets, analyses, auth, shap_interactive, whatif

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
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(analyses.router, prefix="/api/analyses", tags=["analyses"])
app.include_router(shap_interactive.router, prefix="/api/shap", tags=["shap-interactive"])
app.include_router(whatif.router, prefix="/api/whatif", tags=["what-if"])


@app.get("/")
async def root():
    return {"message": "ML Explainer Platform API", "version": "1.0.0"}


@app.get("/health/live")
async def liveness_check():
    return {"status": "healthy"}


@app.get("/health")
@app.get("/health/ready")
async def readiness_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        redis_client = Redis.from_url(settings.REDIS_URL)
        redis_client.ping()
        redis_client.close()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service dependencies are unavailable",
        ) from exc

    return {"status": "ready"}
