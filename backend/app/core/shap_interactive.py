"""
Interactive SHAP data preparation
Converts SHAP values to structured JSON for frontend visualization
"""
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
from datetime import datetime
import shap


def prepare_shap_interactive_data(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_names: List[str],
    predictions: np.ndarray,
    base_value: float,
    sample_indices: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Prepare SHAP data for interactive visualization

    Args:
        shap_values: SHAP values array (n_samples, n_features)
        feature_values: Feature values array (n_samples, n_features)
        feature_names: List of feature names
        predictions: Model predictions array (n_samples,)
        base_value: Base value (expected value)
        sample_indices: Optional list of original sample indices

    Returns:
        Dictionary with structured data for frontend
    """
    n_samples, n_features = shap_values.shape

    if sample_indices is None:
        sample_indices = list(range(n_samples))

    # Structure for each point on summary plot
    points_data = []
    for i in range(n_samples):
        point = {
            'sample_id': int(sample_indices[i]),
            'prediction': float(predictions[i]),
            'features': {}
        }

        for j, fname in enumerate(feature_names):
            point['features'][fname] = {
                'value': float(feature_values[i, j]),
                'shap_value': float(shap_values[i, j]),
                'abs_shap': float(abs(shap_values[i, j]))
            }

        points_data.append(point)

    # Global feature importance
    feature_importance = {}
    for j, fname in enumerate(feature_names):
        feature_shap = shap_values[:, j]
        feature_importance[fname] = {
            'mean_abs_shap': float(np.mean(np.abs(feature_shap))),
            'max_abs_shap': float(np.max(np.abs(feature_shap))),
            'min_shap': float(np.min(feature_shap)),
            'max_shap': float(np.max(feature_shap)),
            'variance': float(np.var(feature_shap)),
            'std': float(np.std(feature_shap)),
            'median_abs_shap': float(np.median(np.abs(feature_shap)))
        }

    # Summary statistics
    summary_stats = {
        'prediction_mean': float(np.mean(predictions)),
        'prediction_std': float(np.std(predictions)),
        'prediction_min': float(np.min(predictions)),
        'prediction_max': float(np.max(predictions)),
        'shap_range': {
            'min': float(np.min(shap_values)),
            'max': float(np.max(shap_values))
        }
    }

    return {
        'points': points_data,
        'feature_importance': feature_importance,
        'base_value': float(base_value),
        'n_samples': n_samples,
        'n_features': n_features,
        'feature_names': feature_names,
        'summary_stats': summary_stats,
        'computed_at': datetime.utcnow().isoformat(),
        'version': '2.0'
    }


def prepare_local_explanation(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_names: List[str],
    base_value: float,
    prediction: float,
    sample_id: int
) -> Dict[str, Any]:
    """
    Prepare local explanation for a single sample

    Args:
        shap_values: SHAP values for single sample (n_features,)
        feature_values: Feature values for single sample (n_features,)
        feature_names: List of feature names
        base_value: Base value (expected value)
        prediction: Model prediction for this sample
        sample_id: Sample identifier

    Returns:
        Dictionary with waterfall and force plot data
    """
    # Sort features by absolute SHAP value
    feature_contributions = []
    for i, fname in enumerate(feature_names):
        feature_contributions.append({
            'feature': fname,
            'value': float(feature_values[i]),
            'shap_value': float(shap_values[i]),
            'abs_shap': float(abs(shap_values[i]))
        })

    feature_contributions.sort(key=lambda x: x['abs_shap'], reverse=True)

    # Waterfall data (cumulative sum)
    waterfall_data = []
    cumulative = base_value

    for contrib in feature_contributions:
        waterfall_data.append({
            'feature': contrib['feature'],
            'value': contrib['value'],
            'shap_value': contrib['shap_value'],
            'start': cumulative,
            'end': cumulative + contrib['shap_value']
        })
        cumulative += contrib['shap_value']

    # Force plot data (for horizontal bar visualization)
    positive_contributions = [c for c in feature_contributions if c['shap_value'] > 0]
    negative_contributions = [c for c in feature_contributions if c['shap_value'] < 0]

    return {
        'sample_id': sample_id,
        'base_value': float(base_value),
        'prediction': float(prediction),
        'feature_contributions': feature_contributions[:20],  # Top 20
        'waterfall_data': waterfall_data[:20],
        'force_plot': {
            'positive': positive_contributions[:10],
            'negative': negative_contributions[:10]
        },
        'explanation_quality': {
            'sum_shap': float(np.sum(shap_values)),
            'expected_sum': float(prediction - base_value),
            'consistency_error': float(abs(np.sum(shap_values) - (prediction - base_value)))
        }
    }


def apply_filters(
    data: Dict[str, Any],
    feature_filter: Optional[str] = None,
    shap_range: Optional[tuple] = None,
    prediction_range: Optional[tuple] = None,
    sample_ids: Optional[List[int]] = None,
    feature_value_filters: Optional[Dict[str, tuple]] = None
) -> Dict[str, Any]:
    """
    Apply filters to SHAP interactive data

    Args:
        data: Full SHAP interactive data
        feature_filter: Filter by specific feature name (for SHAP range)
        shap_range: Tuple (min, max) for SHAP value range (global if no feature_filter)
        prediction_range: Tuple (min, max) for prediction range
        sample_ids: List of specific sample IDs to include
        feature_value_filters: Dict of feature_name -> (min, max) for feature values

    Returns:
        Filtered data
    """
    filtered_points = data['points']

    # Filter by sample IDs
    if sample_ids is not None:
        filtered_points = [p for p in filtered_points if p['sample_id'] in sample_ids]

    # Filter by prediction range
    if prediction_range is not None:
        min_pred, max_pred = prediction_range
        filtered_points = [
            p for p in filtered_points
            if min_pred <= p['prediction'] <= max_pred
        ]

    # Filter by SHAP range
    if shap_range is not None:
        min_shap, max_shap = shap_range
        if feature_filter:
            # Filter by SHAP range for specific feature
            filtered_points = [
                p for p in filtered_points
                if feature_filter in p['features'] and
                min_shap <= p['features'][feature_filter]['shap_value'] <= max_shap
            ]
        else:
            # Global SHAP filter: at least one feature must be in range
            filtered_points = [
                p for p in filtered_points
                if any(
                    min_shap <= feat_data['shap_value'] <= max_shap
                    for feat_data in p['features'].values()
                )
            ]

    # Filter by feature values
    if feature_value_filters:
        for feature_name, (min_val, max_val) in feature_value_filters.items():
            filtered_points = [
                p for p in filtered_points
                if feature_name in p['features'] and
                min_val <= p['features'][feature_name]['value'] <= max_val
            ]

    # Recalculate summary stats for filtered data
    if filtered_points:
        predictions = [p['prediction'] for p in filtered_points]
        all_shap_values = []
        for p in filtered_points:
            for feat_data in p['features'].values():
                all_shap_values.append(feat_data['shap_value'])

        summary_stats = {
            'prediction_mean': float(np.mean(predictions)),
            'prediction_std': float(np.std(predictions)),
            'prediction_min': float(np.min(predictions)),
            'prediction_max': float(np.max(predictions)),
            'shap_range': {
                'min': float(np.min(all_shap_values)) if all_shap_values else 0,
                'max': float(np.max(all_shap_values)) if all_shap_values else 0
            }
        }
    else:
        summary_stats = data['summary_stats']

    return {
        **data,
        'points': filtered_points,
        'n_samples': len(filtered_points),
        'summary_stats': summary_stats,
        'filters_applied': {
            'feature_filter': feature_filter,
            'shap_range': shap_range,
            'prediction_range': prediction_range,
            'sample_ids': sample_ids,
            'feature_value_filters': feature_value_filters
        }
    }


def compute_feature_statistics(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_idx: int
) -> Dict[str, Any]:
    """
    Compute detailed statistics for a specific feature

    Args:
        shap_values: SHAP values array (n_samples, n_features)
        feature_values: Feature values array (n_samples, n_features)
        feature_idx: Index of feature to analyze

    Returns:
        Dictionary with feature statistics
    """
    feature_shap = shap_values[:, feature_idx]
    feature_vals = feature_values[:, feature_idx]

    # Correlation between feature value and SHAP value
    correlation = float(np.corrcoef(feature_vals, feature_shap)[0, 1])

    # Percentiles
    shap_percentiles = {
        'p10': float(np.percentile(feature_shap, 10)),
        'p25': float(np.percentile(feature_shap, 25)),
        'p50': float(np.percentile(feature_shap, 50)),
        'p75': float(np.percentile(feature_shap, 75)),
        'p90': float(np.percentile(feature_shap, 90))
    }

    value_percentiles = {
        'p10': float(np.percentile(feature_vals, 10)),
        'p25': float(np.percentile(feature_vals, 25)),
        'p50': float(np.percentile(feature_vals, 50)),
        'p75': float(np.percentile(feature_vals, 75)),
        'p90': float(np.percentile(feature_vals, 90))
    }

    return {
        'correlation': correlation,
        'shap_percentiles': shap_percentiles,
        'value_percentiles': value_percentiles,
        'mean_abs_shap': float(np.mean(np.abs(feature_shap))),
        'max_impact': float(np.max(np.abs(feature_shap))),
        'positive_impact_ratio': float(np.sum(feature_shap > 0) / len(feature_shap))
    }
