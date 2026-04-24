from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from app.core.database import get_db
from app.core.auth import get_current_user_id
from app.models.models import Analysis
from app.services.storage import storage_service
from app.core.shap_interactive import apply_filters, prepare_local_explanation
import tempfile
import json
import os

router = APIRouter()


@router.get("/{analysis_id}/interactive-data")
async def get_shap_interactive_data(
    analysis_id: UUID,
    feature_filter: Optional[str] = Query(None, description="Filter by feature name"),
    shap_range_min: Optional[float] = Query(None, description="Minimum SHAP value"),
    shap_range_max: Optional[float] = Query(None, description="Maximum SHAP value"),
    prediction_range_min: Optional[float] = Query(None, description="Minimum prediction"),
    prediction_range_max: Optional[float] = Query(None, description="Maximum prediction"),
    sample_ids: Optional[str] = Query(None, description="Comma-separated sample IDs"),
    feature_value_filters: Optional[str] = Query(None, description="JSON object of feature_name -> [min, max]"),
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get interactive SHAP data with optional filtering

    This endpoint returns structured SHAP data for interactive visualization
    instead of static images.
    """
    # Verify analysis ownership
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if analysis.method != 'shap':
        raise HTTPException(status_code=400, detail="This endpoint is only for SHAP analyses")

    if not analysis.result_s3_key:
        raise HTTPException(status_code=404, detail="Analysis results not found")

    # Load results from storage
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp_file:
            storage_service.download_file(analysis.result_s3_key, tmp_file.name)
            with open(tmp_file.name, 'r') as f:
                results = json.load(f)
            os.unlink(tmp_file.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load results: {str(e)}")

    # Extract interactive data
    interactive_data = results.get('visualizations', {}).get('interactive_data')

    if not interactive_data:
        raise HTTPException(
            status_code=404,
            detail="Interactive data not available. Please re-run the analysis."
        )

    # Apply filters if provided
    shap_range = None
    if shap_range_min is not None or shap_range_max is not None:
        shap_range = (
            shap_range_min if shap_range_min is not None else float('-inf'),
            shap_range_max if shap_range_max is not None else float('inf')
        )

    prediction_range = None
    if prediction_range_min is not None or prediction_range_max is not None:
        prediction_range = (
            prediction_range_min if prediction_range_min is not None else float('-inf'),
            prediction_range_max if prediction_range_max is not None else float('inf')
        )

    sample_id_list = None
    if sample_ids:
        try:
            sample_id_list = [int(sid.strip()) for sid in sample_ids.split(',')]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid sample_ids format")

    # Parse feature value filters
    feature_value_filter_dict = None
    if feature_value_filters:
        try:
            feature_value_filter_dict = json.loads(feature_value_filters)
            # Convert to tuples
            feature_value_filter_dict = {
                k: tuple(v) for k, v in feature_value_filter_dict.items()
            }
        except (json.JSONDecodeError, ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid feature_value_filters format")

    filtered_data = apply_filters(
        data=interactive_data,
        feature_filter=feature_filter,
        shap_range=shap_range,
        prediction_range=prediction_range,
        sample_ids=sample_id_list,
        feature_value_filters=feature_value_filter_dict
    )

    return filtered_data


@router.get("/{analysis_id}/local-explanation/{sample_id}")
async def get_local_explanation(
    analysis_id: UUID,
    sample_id: int,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get local explanation for a specific sample

    Returns waterfall and force plot data for detailed instance-level analysis.
    """
    # Verify analysis ownership
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if not analysis.result_s3_key:
        raise HTTPException(status_code=404, detail="Analysis results not found")

    # Load results
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp_file:
            storage_service.download_file(analysis.result_s3_key, tmp_file.name)
            with open(tmp_file.name, 'r') as f:
                results = json.load(f)
            os.unlink(tmp_file.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load results: {str(e)}")

    # Extract interactive data
    interactive_data = results.get('visualizations', {}).get('interactive_data')

    if not interactive_data:
        raise HTTPException(status_code=404, detail="Interactive data not available")

    # Find the sample
    sample_data = None
    for point in interactive_data['points']:
        if point['sample_id'] == sample_id:
            sample_data = point
            break

    if not sample_data:
        raise HTTPException(status_code=404, detail=f"Sample {sample_id} not found")

    # Prepare local explanation
    import numpy as np

    feature_names = interactive_data['feature_names']
    shap_values = np.array([sample_data['features'][f]['shap_value'] for f in feature_names])
    feature_values = np.array([sample_data['features'][f]['value'] for f in feature_names])

    local_explanation = prepare_local_explanation(
        shap_values=shap_values,
        feature_values=feature_values,
        feature_names=feature_names,
        base_value=interactive_data['base_value'],
        prediction=sample_data['prediction'],
        sample_id=sample_id
    )

    return local_explanation


@router.get("/{analysis_id}/feature-stats/{feature_name}")
async def get_feature_statistics(
    analysis_id: UUID,
    feature_name: str,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get detailed statistics for a specific feature

    Returns correlation, percentiles, and impact metrics.
    """
    # Verify analysis ownership
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if not analysis.result_s3_key:
        raise HTTPException(status_code=404, detail="Analysis results not found")

    # Load results
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp_file:
            storage_service.download_file(analysis.result_s3_key, tmp_file.name)
            with open(tmp_file.name, 'r') as f:
                results = json.load(f)
            os.unlink(tmp_file.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load results: {str(e)}")

    # Extract interactive data
    interactive_data = results.get('visualizations', {}).get('interactive_data')

    if not interactive_data:
        raise HTTPException(status_code=404, detail="Interactive data not available")

    if feature_name not in interactive_data['feature_names']:
        raise HTTPException(status_code=404, detail=f"Feature '{feature_name}' not found")

    # Get feature importance
    feature_importance = interactive_data['feature_importance'].get(feature_name, {})

    # Compute additional statistics
    import numpy as np
    from app.core.shap_interactive import compute_feature_statistics

    # Extract arrays for this feature
    shap_values = []
    feature_values = []
    for point in interactive_data['points']:
        if feature_name in point['features']:
            shap_values.append(point['features'][feature_name]['shap_value'])
            feature_values.append(point['features'][feature_name]['value'])

    shap_values = np.array(shap_values).reshape(-1, 1)
    feature_values = np.array(feature_values).reshape(-1, 1)

    detailed_stats = compute_feature_statistics(
        shap_values=shap_values,
        feature_values=feature_values,
        feature_idx=0
    )

    return {
        'feature_name': feature_name,
        'importance': feature_importance,
        'statistics': detailed_stats
    }


@router.get("/{analysis_id}/comparison")
async def compare_samples(
    analysis_id: UUID,
    sample_ids: str = Query(..., description="Comma-separated sample IDs to compare"),
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Compare multiple samples side-by-side

    Returns local explanations for each sample for comparison.
    """
    # Parse sample IDs
    try:
        sample_id_list = [int(sid.strip()) for sid in sample_ids.split(',')]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid sample_ids format")

    if len(sample_id_list) < 2:
        raise HTTPException(status_code=400, detail="At least 2 samples required for comparison")

    if len(sample_id_list) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 samples can be compared")

    # Verify analysis ownership
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if not analysis.result_s3_key:
        raise HTTPException(status_code=404, detail="Analysis results not found")

    # Load results
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp_file:
            storage_service.download_file(analysis.result_s3_key, tmp_file.name)
            with open(tmp_file.name, 'r') as f:
                results = json.load(f)
            os.unlink(tmp_file.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load results: {str(e)}")

    # Extract interactive data
    interactive_data = results.get('visualizations', {}).get('interactive_data')

    if not interactive_data:
        raise HTTPException(status_code=404, detail="Interactive data not available")

    # Get local explanations for each sample
    import numpy as np

    comparisons = []
    for sample_id in sample_id_list:
        # Find sample
        sample_data = None
        for point in interactive_data['points']:
            if point['sample_id'] == sample_id:
                sample_data = point
                break

        if not sample_data:
            raise HTTPException(status_code=404, detail=f"Sample {sample_id} not found")

        # Prepare local explanation
        feature_names = interactive_data['feature_names']
        shap_values = np.array([sample_data['features'][f]['shap_value'] for f in feature_names])
        feature_values = np.array([sample_data['features'][f]['value'] for f in feature_names])

        local_explanation = prepare_local_explanation(
            shap_values=shap_values,
            feature_values=feature_values,
            feature_names=feature_names,
            base_value=interactive_data['base_value'],
            prediction=sample_data['prediction'],
            sample_id=sample_id
        )

        comparisons.append(local_explanation)

    return {
        'samples': comparisons,
        'base_value': interactive_data['base_value']
    }
