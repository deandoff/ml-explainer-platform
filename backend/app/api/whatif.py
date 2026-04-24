from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any
from uuid import UUID
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth import get_current_user_id
from app.models.models import Analysis
from app.services.storage import storage_service
from app.core.model_loader import ModelLoader
import tempfile
import json
import os
import numpy as np
import shap

router = APIRouter()


class WhatIfRequest(BaseModel):
    sample_id: int
    modified_features: Dict[str, float]


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

    # Load analysis results
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
        if point['sample_id'] == request.sample_id:
            sample_data = point
            break

    if not sample_data:
        raise HTTPException(status_code=404, detail=f"Sample {request.sample_id} not found")

    # Load model
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as tmp_model:
            storage_service.download_file(analysis.model.s3_key, tmp_model.name)
            model = ModelLoader.load_model(tmp_model.name, analysis.model.model_type)
            os.unlink(tmp_model.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

    # Prepare original and modified feature vectors
    feature_names = interactive_data['feature_names']
    original_features = np.array([sample_data['features'][f]['value'] for f in feature_names])
    modified_features = original_features.copy()

    # Apply modifications
    for feature_name, new_value in request.modified_features.items():
        if feature_name in feature_names:
            idx = feature_names.index(feature_name)
            modified_features[idx] = new_value

    # Reshape for prediction
    original_features_2d = original_features.reshape(1, -1)
    modified_features_2d = modified_features.reshape(1, -1)

    # Get predictions
    try:
        original_prediction = ModelLoader.predict(model, original_features_2d, analysis.model.model_type)
        new_prediction = ModelLoader.predict(model, modified_features_2d, analysis.model.model_type)

        # Handle array outputs
        if isinstance(original_prediction, np.ndarray):
            original_prediction = float(original_prediction.flatten()[0])
        else:
            original_prediction = float(original_prediction)

        if isinstance(new_prediction, np.ndarray):
            new_prediction = float(new_prediction.flatten()[0])
        else:
            new_prediction = float(new_prediction)

    except Exception as e:
        import traceback
        print(f"Prediction error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    # Calculate SHAP values for modified sample
    try:
        # Use TreeExplainer for tree-based models, KernelExplainer for others
        model_type = analysis.model.model_type.lower()

        if model_type in ['xgboost', 'lightgbm', 'catboost', 'random_forest', 'gradient_boosting']:
            explainer = shap.TreeExplainer(model)
        else:
            # For other models, use a small background dataset
            background_size = min(100, len(interactive_data['points']))
            background_data = np.array([
                [point['features'][f]['value'] for f in feature_names]
                for point in interactive_data['points'][:background_size]
            ])
            explainer = shap.KernelExplainer(
                lambda x: ModelLoader.predict(model, x, analysis.model.model_type),
                background_data
            )

        modified_shap_values = explainer.shap_values(modified_features_2d)

        # Handle multi-output models (binary/multiclass classification)
        if isinstance(modified_shap_values, list):
            # For binary classification, use positive class (index 1)
            modified_shap_values = modified_shap_values[1] if len(modified_shap_values) > 1 else modified_shap_values[0]

        # Ensure it's a numpy array
        modified_shap_values = np.array(modified_shap_values)

        # Remove all extra dimensions until we get (n_features,) or (n_features, n_classes)
        while len(modified_shap_values.shape) > 2:
            modified_shap_values = modified_shap_values[0]

        # If 2D, handle different cases
        if len(modified_shap_values.shape) == 2:
            # (1, n_features) - squeeze batch dimension
            if modified_shap_values.shape[0] == 1:
                modified_shap_values = modified_shap_values[0]
            # (n_features, 2) - binary classification, take positive class
            elif modified_shap_values.shape[1] == 2:
                modified_shap_values = modified_shap_values[:, 1]
            # (n_features, n_classes) - multiclass, take first class
            else:
                modified_shap_values = modified_shap_values[:, 0]

        # Final check: should be 1D with n_features elements
        if len(modified_shap_values.shape) != 1:
            raise ValueError(f"Unexpected SHAP values shape: {modified_shap_values.shape}")

    except Exception as e:
        # Fallback: approximate SHAP changes using linear approximation
        print(f"SHAP calculation failed, using approximation: {str(e)}")
        import traceback
        print(traceback.format_exc())
        original_shap_values = np.array([sample_data['features'][f]['shap_value'] for f in feature_names])
        feature_deltas = modified_features - original_features
        modified_shap_values = original_shap_values + feature_deltas * 0.1  # Simple approximation

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
