from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict
from uuid import UUID
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth import get_current_user_id
from app.models.models import Analysis
from app.services.storage import storage_service
from app.core.model_loader import ModelLoader
from app.core.explainers import SHAPExplainer
from app.core.analysis_utils import (
    select_prediction_output,
    select_shap_output,
)
import tempfile
import json
import os
import numpy as np
import pandas as pd
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class WhatIfRequest(BaseModel):
    sample_id: int
    modified_features: Dict[str, float]

def get_interactive_data(results):
    visualizations = results.get('visualizations')
    if not isinstance(visualizations, dict):
        return None
    return visualizations.get('interactive_data')

@router.post("/{analysis_id}/what-if")
async def what_if_analysis(
    analysis_id: UUID,
    request: WhatIfRequest,
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Perform What-If analysis by modifying feature values and recalculating prediction

    Returns:
    - new_prediction: Updated prediction with modified features
    - original_prediction: Original prediction
    - prediction_delta: Difference between new and original
    - modified_shap_values: SHAP values for modified sample
    - original_shap_values: Original SHAP values
    - shap_deltas: Changes in SHAP contributions
    """
    # Verify analysis ownership
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if analysis.method != 'shap':
        raise HTTPException(status_code=400, detail="What-If analysis only available for SHAP")

    if not analysis.result_s3_key:
        raise HTTPException(status_code=404, detail="Analysis results not found")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp_file:
            storage_service.download_file(analysis.result_s3_key, tmp_file.name)
            with open(tmp_file.name, 'r') as f:
                results = json.load(f)
            os.unlink(tmp_file.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load results: {str(e)}")

    interactive_data = get_interactive_data(results)
    if not interactive_data:
        raise HTTPException(status_code=404, detail="Interactive data not available")

    # Find the sample
    sample_data = None
    for point in interactive_data['points']:
        if point['sample_id'] == request.sample_id:
            sample_data = point
            break

    if not sample_data:
        raise HTTPException(status_code=404, detail=f"Sample {request.sample_id} not found")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as tmp_model:
            storage_service.download_file(analysis.model.s3_key, tmp_model.name)
            model = ModelLoader.load_model(tmp_model.name, analysis.model.model_type)
            os.unlink(tmp_model.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

    # Prepare original and modified feature vectors
    feature_names = interactive_data['feature_names']
    unknown_features = set(request.modified_features) - set(feature_names)
    if unknown_features:
        unknown_list = ", ".join(sorted(unknown_features))
        raise HTTPException(
            status_code=400,
            detail=f"Unknown feature names: {unknown_list}",
        )

    original_features = np.array([sample_data['features'][f]['value'] for f in feature_names])
    modified_features = original_features.copy()

    # Apply modifications
    for feature_name, new_value in request.modified_features.items():
        idx = feature_names.index(feature_name)
        modified_features[idx] = new_value

    original_features_df = pd.DataFrame([original_features], columns=feature_names)
    modified_features_df = pd.DataFrame([modified_features], columns=feature_names)
    model_type = getattr(analysis.model.model_type, "value", analysis.model.model_type)
    output_index = interactive_data.get('explained_output')

    try:
        original_predictions = ModelLoader.predict(model, original_features_df, model_type)
        new_predictions = ModelLoader.predict(model, modified_features_df, model_type)
        original_prediction = float(
            select_prediction_output(original_predictions, output_index)[0][0]
        )
        new_prediction = float(
            select_prediction_output(new_predictions, output_index)[0][0]
        )

    except Exception as e:
        logger.exception("Prediction failed for what-if analysis %s sample %s", analysis_id, request.sample_id)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    try:
        background_size = min(100, len(interactive_data['points']))
        background_data = pd.DataFrame(
            [
                [point['features'][f]['value'] for f in feature_names]
                for point in interactive_data['points'][:background_size]
            ],
            columns=feature_names,
        )
        explainer = SHAPExplainer(
            model,
            model_type,
            background_data,
            output_index=output_index,
        )
        raw_modified_shap = explainer.explainer(modified_features_df)
        modified_shap_values = select_shap_output(
            raw_modified_shap.values,
            output_index,
        )[0]
    except Exception as e:
        logger.exception(
            "SHAP recalculation failed for what-if analysis %s sample %s",
            analysis_id,
            request.sample_id
        )
        raise HTTPException(
            status_code=500,
            detail=f"SHAP recalculation failed: {str(e)}",
        )

    # Prepare response
    original_shap_values = np.array([sample_data['features'][f]['shap_value'] for f in feature_names])
    shap_deltas = modified_shap_values - original_shap_values

    feature_changes = []
    for i, fname in enumerate(feature_names):
        if fname in request.modified_features:
            feature_changes.append({
                'feature': fname,
                'original_value': float(original_features[i]),
                'new_value': float(modified_features[i]),
                'value_delta': float(modified_features[i] - original_features[i]),
                'original_shap': float(original_shap_values[i]),
                'new_shap': float(modified_shap_values[i]),
                'shap_delta': float(shap_deltas[i])
            })

    return {
        'sample_id': request.sample_id,
        'original_prediction': original_prediction,
        'new_prediction': new_prediction,
        'prediction_delta': new_prediction - original_prediction,
        'base_value': interactive_data['base_value'],
        'feature_changes': feature_changes,
        'all_features': {
            fname: {
                'original_value': float(original_features[i]),
                'new_value': float(modified_features[i]),
                'original_shap': float(original_shap_values[i]),
                'new_shap': float(modified_shap_values[i]),
                'shap_delta': float(shap_deltas[i])
            }
            for i, fname in enumerate(feature_names)
        }
    }
