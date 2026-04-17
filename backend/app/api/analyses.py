from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.models import Analysis as AnalysisDB, AnalysisStatus, Model as ModelDB, Dataset as DatasetDB
from app.schemas.schemas import AnalysisCreate, AnalysisResponse
from app.core.tasks import run_shap_analysis, run_lime_analysis
from datetime import datetime

router = APIRouter()


@router.post("/", response_model=AnalysisResponse)
async def create_analysis(
    analysis: AnalysisCreate,
    db: Session = Depends(get_db)
):
    """Create and start new analysis"""
    # Verify model exists
    model = db.query(ModelDB).filter(ModelDB.id == analysis.model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Verify dataset exists
    dataset = db.query(DatasetDB).filter(DatasetDB.id == analysis.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Create analysis record
    db_analysis = AnalysisDB(
        model_id=analysis.model_id,
        dataset_id=analysis.dataset_id,
        explainer_type=analysis.explainer_type.value,
        status=AnalysisStatus.PENDING
    )

    db.add(db_analysis)
    db.commit()
    db.refresh(db_analysis)

    # Start Celery task
    try:
        if analysis.explainer_type.value == "shap":
            task = run_shap_analysis.delay(
                model_s3_key=model.s3_key,
                dataset_s3_key=dataset.s3_key,
                model_type=model.model_type,
                analysis_id=db_analysis.id
            )
        else:  # lime
            task = run_lime_analysis.delay(
                model_s3_key=model.s3_key,
                dataset_s3_key=dataset.s3_key,
                model_type=model.model_type,
                analysis_id=db_analysis.id
            )

        # Update with task ID
        db_analysis.celery_task_id = task.id
        db_analysis.status = AnalysisStatus.RUNNING
        db.commit()
        db.refresh(db_analysis)

        return db_analysis

    except Exception as e:
        db_analysis.status = AnalysisStatus.FAILED
        db_analysis.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to start analysis: {str(e)}")


@router.get("/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """Get analysis by ID"""
    analysis = db.query(AnalysisDB).filter(AnalysisDB.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis


@router.get("/{analysis_id}/status")
async def get_analysis_status(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """Get analysis status and progress"""
    analysis = db.query(AnalysisDB).filter(AnalysisDB.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Check Celery task status if running
    if analysis.celery_task_id and analysis.status == AnalysisStatus.RUNNING:
        from app.core.celery_app import celery_app
        task = celery_app.AsyncResult(analysis.celery_task_id)

        if task.state == 'SUCCESS':
            result = task.result
            analysis.status = AnalysisStatus.COMPLETED
            analysis.result_s3_key = result.get('result_s3_key')
            analysis.completed_at = datetime.utcnow()
            db.commit()

        elif task.state == 'FAILURE':
            analysis.status = AnalysisStatus.FAILED
            analysis.error_message = str(task.info)
            db.commit()

        return {
            "analysis_id": analysis.id,
            "status": analysis.status.value,
            "task_state": task.state,
            "progress": task.info if task.state == 'PROGRESS' else None
        }

    return {
        "analysis_id": analysis.id,
        "status": analysis.status.value
    }


@router.get("/{analysis_id}/results")
async def get_analysis_results(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """Get analysis results"""
    analysis = db.query(AnalysisDB).filter(AnalysisDB.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if analysis.status != AnalysisStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Analysis not completed yet")

    if not analysis.result_s3_key:
        raise HTTPException(status_code=404, detail="Results not found")

    # Get presigned URL for results
    from app.services.storage import storage_service
    download_url = storage_service.generate_presigned_download_url(analysis.result_s3_key)

    return {
        "analysis_id": analysis.id,
        "download_url": download_url,
        "result_s3_key": analysis.result_s3_key
    }


@router.get("/", response_model=List[AnalysisResponse])
async def list_analyses(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all analyses"""
    analyses = db.query(AnalysisDB).offset(skip).limit(limit).all()
    return analyses
