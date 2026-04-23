"""
Native SHAP visualizations using matplotlib
Converts plots to base64 images for web display
"""
import shap
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from typing import Dict, Any, List
import io
import base64


def fig_to_base64(fig) -> str:
    """Convert matplotlib figure to base64 string"""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight', facecolor='white', edgecolor='none')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return f"data:image/png;base64,{img_base64}"


def generate_shap_summary_plot_native(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_names: List[str]
) -> Dict[str, Any]:
    """
    Generate native SHAP summary plot (beeswarm)

    Args:
        shap_values: SHAP values array (n_samples, n_features) or Explanation object
        feature_values: Feature values array (n_samples, n_features)
        feature_names: List of feature names

    Returns:
        Dict with base64 image
    """
    plt.figure(figsize=(12, 8))
    plt.rcParams.update({'font.size': 11})

    # Create Explanation object for new SHAP API
    if not isinstance(shap_values, shap.Explanation):
        explanation = shap.Explanation(
            values=shap_values,
            data=feature_values,
            feature_names=feature_names
        )
    else:
        explanation = shap_values

    # Use new SHAP plots API
    shap.plots.beeswarm(explanation, show=False, max_display=20, order=shap_values.abs.max(0), color=plt.get_cmap("cool"))

    fig = plt.gcf()
    img_base64 = fig_to_base64(fig)

    return {
        'type': 'image',
        'image': img_base64,
        'title': 'SHAP Summary Plot'
    }


def generate_shap_waterfall_native(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_names: List[str],
    base_value: float,
    instance_idx: int = 0
) -> Dict[str, Any]:
    """
    Generate native SHAP waterfall plot for single instance

    Args:
        shap_values: SHAP values array (n_samples, n_features) or Explanation object
        feature_values: Feature values array (n_samples, n_features)
        feature_names: List of feature names
        base_value: Base value (expected value)
        instance_idx: Index of instance to explain

    Returns:
        Dict with base64 image
    """
    plt.figure(figsize=(12, 8))
    plt.rcParams.update({'font.size': 11})

    # Create Explanation object for waterfall plot
    if not isinstance(shap_values, shap.Explanation):
        explanation = shap.Explanation(
            values=shap_values[instance_idx],
            base_values=base_value,
            data=feature_values[instance_idx],
            feature_names=np.array(feature_names)
        )
    else:
        explanation = shap_values[instance_idx]

    # Use new SHAP plots API
    shap.plots.waterfall(explanation, show=False, max_display=15)

    fig = plt.gcf()
    img_base64 = fig_to_base64(fig)

    return {
        'type': 'image',
        'image': img_base64,
        'title': f'SHAP Waterfall Plot - Instance {instance_idx}'
    }


def generate_shap_dependence_native(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_names: List[str],
    feature_idx: int,
    interaction_idx: int = None
) -> Dict[str, Any]:
    """
    Generate native SHAP dependence plot

    Args:
        shap_values: SHAP values array (n_samples, n_features)
        feature_values: Feature values array (n_samples, n_features)
        feature_names: List of feature names
        feature_idx: Index of feature to plot
        interaction_idx: Optional index of interaction feature

    Returns:
        Dict with base64 image
    """
    plt.figure(figsize=(10, 6))
    plt.rcParams.update({'font.size': 11})

    # Convert to pandas DataFrame for SHAP compatibility
    feature_df = pd.DataFrame(feature_values, columns=feature_names)

    # Use native SHAP dependence plot
    shap.dependence_plot(
        feature_idx,
        shap_values,
        feature_df,
        interaction_index=interaction_idx if interaction_idx is not None else 'auto',
        show=False,
        dot_size=40,
        alpha=0.8
    )

    fig = plt.gcf()
    img_base64 = fig_to_base64(fig)

    feature_name = feature_names[feature_idx]
    return {
        'type': 'image',
        'image': img_base64,
        'title': f'SHAP Dependence Plot: {feature_name}'
    }


def generate_shap_bar_plot_native(
    shap_values: np.ndarray,
    feature_names: List[str],
    max_display: int = 20
) -> Dict[str, Any]:
    """
    Generate native SHAP bar plot (feature importance)

    Args:
        shap_values: SHAP values array (n_samples, n_features) or Explanation object
        feature_names: List of feature names
        max_display: Maximum number of features to display

    Returns:
        Dict with base64 image
    """
    plt.figure(figsize=(10, 8))
    plt.rcParams.update({'font.size': 11})

    # Create Explanation object for new SHAP API
    if not isinstance(shap_values, shap.Explanation):
        explanation = shap.Explanation(
            values=shap_values,
            feature_names=np.array(feature_names)
        )
    else:
        explanation = shap_values

    # Use new SHAP plots API
    shap.plots.bar(explanation, show=False, max_display=max_display)

    fig = plt.gcf()
    img_base64 = fig_to_base64(fig)

    return {
        'type': 'image',
        'image': img_base64,
        'title': 'Feature Importance'
    }
