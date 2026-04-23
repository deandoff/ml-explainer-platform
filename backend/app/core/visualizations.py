"""
Visualization generation module for SHAP, LIME and model metrics
Uses native SHAP plots converted to base64 images for authentic look
"""
import plotly.graph_objects as go
import plotly.express as px
import numpy as np
import pandas as pd
from typing import Dict, Any, List
import json
import shap
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import io
import base64


def fig_to_base64(fig) -> str:
    """Convert matplotlib figure to base64 string"""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return f"data:image/png;base64,{img_base64}"


def generate_shap_summary_plot(shap_values: np.ndarray, feature_names: List[str], feature_values: np.ndarray = None) -> Dict[str, Any]:
    """
    Generate SHAP summary plot (beeswarm style)

    Args:
        shap_values: SHAP values array (n_samples, n_features)
        feature_names: List of feature names
        feature_values: Feature values array (n_samples, n_features) for coloring

    Returns:
        Plotly figure as dict
    """
    # Calculate mean absolute SHAP values for sorting
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    sorted_indices = np.argsort(mean_abs_shap)  # Ascending order (least important first)

    # Limit to top 15 features for readability
    top_n = min(15, len(feature_names))
    sorted_indices = sorted_indices[-top_n:]  # Take last N (most important)

    fig = go.Figure()

    for i in range(top_n):
        # Extract index as Python int
        idx_value = sorted_indices[i]
        if isinstance(idx_value, np.ndarray):
            idx = int(idx_value.flat[0])
        else:
            idx = int(idx_value)

        feature_name = feature_names[idx]
        shap_vals = shap_values[:, idx]

        # Add jitter to Y axis to separate overlapping points (beeswarm style)
        y_positions = np.random.uniform(-0.3, 0.3, len(shap_vals)) + i

        # Use feature values for coloring if available
        if feature_values is not None:
            feat_vals = feature_values[:, idx]
            # Normalize for color scale (0 = low, 1 = high)
            if feat_vals.max() > feat_vals.min():
                feat_vals_norm = (feat_vals - feat_vals.min()) / (feat_vals.max() - feat_vals.min())
            else:
                feat_vals_norm = np.ones_like(feat_vals) * 0.5
        else:
            # Fallback: color by SHAP value magnitude
            feat_vals_norm = np.abs(shap_vals)
            if feat_vals_norm.max() > 0:
                feat_vals_norm = feat_vals_norm / feat_vals_norm.max()

        fig.add_trace(go.Scatter(
            x=shap_vals,
            y=y_positions,
            mode='markers',
            marker=dict(
                size=5,
                color=feat_vals_norm,
                colorscale='RdBu_r',  # Red = high, Blue = low
                showscale=(i == 0),  # Show scale only once
                colorbar=dict(
                    title="Feature<br>value",
                    titleside="right",
                    x=1.02,
                    len=0.6,
                    tickmode='array',
                    tickvals=[0, 1],
                    ticktext=['Low', 'High']
                ),
                line=dict(width=0.2, color='rgba(255,255,255,0.3)'),
                opacity=0.8
            ),
            name=feature_name,
            showlegend=False,
            hovertemplate=f'<b>{feature_name}</b><br>SHAP: %{{x:.4f}}<extra></extra>'
        ))

    fig.update_layout(
        title='SHAP Summary Plot',
        xaxis_title='SHAP value (impact on model output)',
        yaxis_title='',
        height=max(450, top_n * 45),
        hovermode='closest',
        plot_bgcolor='rgba(240,240,240,0.3)',
        margin=dict(l=150, r=100, t=60, b=60),
        yaxis=dict(
            tickmode='array',
            tickvals=list(range(top_n)),
            ticktext=[feature_names[int(sorted_indices[i].flat[0]) if isinstance(sorted_indices[i], np.ndarray) else int(sorted_indices[i])] for i in range(top_n)],
            range=[-0.5, top_n - 0.5],
            gridcolor='rgba(200,200,200,0.2)'
        ),
        xaxis=dict(
            gridcolor='rgba(200,200,200,0.2)',
            zeroline=True,
            zerolinewidth=1.5,
            zerolinecolor='rgba(100,100,100,0.5)'
        )
    )

    fig.add_vline(x=0, line_dash="dash", line_color="gray", opacity=0.5)

    return json.loads(fig.to_json())


def generate_lime_bar_chart(feature_importance: Dict[str, float]) -> Dict[str, Any]:
    """
    Generate LIME feature importance bar chart

    Args:
        feature_importance: Dict with feature rules as keys and importance as values

    Returns:
        Plotly figure as dict
    """
    # Sort by absolute importance
    sorted_features = sorted(feature_importance.items(), key=lambda x: abs(x[1]), reverse=True)

    # Limit to top 15
    top_n = min(15, len(sorted_features))
    sorted_features = sorted_features[:top_n]

    features = [f[0] for f in sorted_features]
    importances = [f[1] for f in sorted_features]

    # Color based on positive/negative
    colors = ['#2ecc71' if imp > 0 else '#e74c3c' for imp in importances]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        y=features,
        x=importances,
        orientation='h',
        marker=dict(color=colors),
        text=[f'{imp:+.4f}' for imp in importances],
        textposition='outside',
        hovertemplate='<b>%{y}</b><br>Importance: %{x:.4f}<extra></extra>'
    ))

    fig.update_layout(
        title='LIME Feature Importance',
        xaxis_title='Importance (contribution to prediction)',
        yaxis_title='Feature Rules',
        height=max(400, top_n * 35),
        plot_bgcolor='white',
        yaxis=dict(
            categoryorder='total ascending'
        ),
        showlegend=False
    )

    fig.add_vline(x=0, line_dash="dash", line_color="gray", opacity=0.5)

    return json.loads(fig.to_json())


def generate_confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, class_names: List[str] = None) -> Dict[str, Any]:
    """
    Generate confusion matrix heatmap

    Args:
        y_true: True labels
        y_pred: Predicted labels
        class_names: Optional class names

    Returns:
        Plotly figure as dict
    """
    from sklearn.metrics import confusion_matrix

    cm = confusion_matrix(y_true, y_pred)

    if class_names is None:
        class_names = [f'Class {i}' for i in range(len(cm))]

    # Calculate percentages
    cm_percent = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis] * 100

    # Create annotations
    annotations = []
    for i in range(len(cm)):
        for j in range(len(cm)):
            annotations.append(
                dict(
                    x=j,
                    y=i,
                    text=f'{cm[i, j]}<br>({cm_percent[i, j]:.1f}%)',
                    showarrow=False,
                    font=dict(color='white' if cm[i, j] > cm.max() / 2 else 'black')
                )
            )

    fig = go.Figure(data=go.Heatmap(
        z=cm,
        x=class_names,
        y=class_names,
        colorscale='Blues',
        showscale=True,
        hovertemplate='True: %{y}<br>Predicted: %{x}<br>Count: %{z}<extra></extra>'
    ))

    fig.update_layout(
        title='Confusion Matrix',
        xaxis_title='Predicted Label',
        yaxis_title='True Label',
        annotations=annotations,
        height=500,
        width=500
    )

    return json.loads(fig.to_json())


def generate_metrics_cards(y_true: np.ndarray, y_pred: np.ndarray, y_pred_proba: np.ndarray = None) -> Dict[str, Any]:
    """
    Calculate classification metrics

    Args:
        y_true: True labels
        y_pred: Predicted labels
        y_pred_proba: Prediction probabilities (optional, for AUC)

    Returns:
        Dict with metrics
    """
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

    metrics = {
        'accuracy': float(accuracy_score(y_true, y_pred)),
        'precision': float(precision_score(y_true, y_pred, average='weighted', zero_division=0)),
        'recall': float(recall_score(y_true, y_pred, average='weighted', zero_division=0)),
        'f1_score': float(f1_score(y_true, y_pred, average='weighted', zero_division=0))
    }

    # Add AUC if probabilities provided
    if y_pred_proba is not None:
        try:
            if len(np.unique(y_true)) == 2:  # Binary classification
                metrics['auc'] = float(roc_auc_score(y_true, y_pred_proba[:, 1]))
            else:  # Multi-class
                metrics['auc'] = float(roc_auc_score(y_true, y_pred_proba, multi_class='ovr', average='weighted'))
        except:
            pass

    return metrics


def generate_feature_importance_bar(feature_importance: Dict[str, float]) -> Dict[str, Any]:
    """
    Generate simple feature importance bar chart (for global SHAP)

    Args:
        feature_importance: Dict with feature names and importance values

    Returns:
        Plotly figure as dict
    """
    # Sort by importance
    sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)

    # Limit to top 15
    top_n = min(15, len(sorted_features))
    sorted_features = sorted_features[:top_n]

    features = [f[0] for f in sorted_features]
    importances = [f[1] for f in sorted_features]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        y=features,
        x=importances,
        orientation='h',
        marker=dict(
            color=importances,
            colorscale='Viridis',
            showscale=False
        ),
        text=[f'{imp:.4f}' for imp in importances],
        textposition='outside',
        hovertemplate='<b>%{y}</b><br>Importance: %{x:.4f}<extra></extra>'
    ))

    fig.update_layout(
        title='Global Feature Importance',
        xaxis_title='Mean |SHAP Value|',
        yaxis_title='Features',
        height=max(400, top_n * 35),
        plot_bgcolor='white',
        yaxis=dict(
            categoryorder='total ascending'
        )
    )

    return json.loads(fig.to_json())


def generate_shap_dependence_plot(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_names: List[str],
    feature_idx: int,
    interaction_idx: int = None
) -> Dict[str, Any]:
    """
    Generate SHAP dependence plot for a specific feature

    Args:
        shap_values: SHAP values array (n_samples, n_features)
        feature_values: Feature values array (n_samples, n_features)
        feature_names: List of feature names
        feature_idx: Index of feature to plot
        interaction_idx: Optional index of interaction feature for coloring

    Returns:
        Plotly figure as dict
    """
    feature_name = feature_names[feature_idx]
    x_values = feature_values[:, feature_idx]
    y_values = shap_values[:, feature_idx]

    # Color by interaction feature if specified
    if interaction_idx is not None and interaction_idx != feature_idx:
        interaction_name = feature_names[interaction_idx]
        color_values = feature_values[:, interaction_idx]
        color_title = f"{interaction_name}"
    else:
        # Color by feature value itself
        color_values = x_values
        color_title = f"{feature_name}"

    # Normalize colors
    if color_values.max() > color_values.min():
        color_norm = (color_values - color_values.min()) / (color_values.max() - color_values.min())
    else:
        color_norm = np.ones_like(color_values) * 0.5

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=x_values,
        y=y_values,
        mode='markers',
        marker=dict(
            size=6,
            color=color_norm,
            colorscale='Viridis',
            showscale=True,
            colorbar=dict(
                title=color_title,
                titleside="right"
            ),
            line=dict(width=0.3, color='rgba(255,255,255,0.3)'),
            opacity=0.7
        ),
        hovertemplate=f'<b>{feature_name}</b>: %{{x:.3f}}<br>SHAP: %{{y:.4f}}<extra></extra>'
    ))

    fig.update_layout(
        title=f'SHAP Dependence Plot: {feature_name}',
        xaxis_title=feature_name,
        yaxis_title=f'SHAP value for {feature_name}',
        height=450,
        plot_bgcolor='rgba(240,240,240,0.3)',
        hovermode='closest',
        xaxis=dict(gridcolor='rgba(200,200,200,0.2)'),
        yaxis=dict(
            gridcolor='rgba(200,200,200,0.2)',
            zeroline=True,
            zerolinewidth=1.5,
            zerolinecolor='rgba(100,100,100,0.5)'
        )
    )

    return json.loads(fig.to_json())


def generate_shap_waterfall(
    shap_values: np.ndarray,
    feature_values: np.ndarray,
    feature_names: List[str],
    base_value: float,
    instance_idx: int = 0
) -> Dict[str, Any]:
    """
    Generate SHAP waterfall plot for a single instance

    Args:
        shap_values: SHAP values array (n_samples, n_features)
        feature_values: Feature values array (n_samples, n_features)
        feature_names: List of feature names
        base_value: Base value (expected value)
        instance_idx: Index of instance to explain

    Returns:
        Plotly figure as dict
    """
    instance_shap = shap_values[instance_idx]
    instance_features = feature_values[instance_idx]

    # Sort by absolute SHAP value
    sorted_indices = np.argsort(np.abs(instance_shap))[::-1]

    # Limit to top 10 features
    top_n = min(10, len(feature_names))
    top_indices = sorted_indices[:top_n]

    # Prepare data
    labels = []
    values = []

    for idx in top_indices:
        feat_name = feature_names[idx]
        feat_val = instance_features[idx]
        shap_val = instance_shap[idx]
        labels.append(f"{feat_name} = {feat_val:.2f}")
        values.append(shap_val)

    # Add base and prediction
    labels = ['Base value'] + labels + ['Prediction']

    # Calculate cumulative values for waterfall
    cumulative_values = [base_value]
    current = base_value
    for val in values:
        current += val
        cumulative_values.append(current)

    # Create waterfall chart
    fig = go.Figure()

    # Base value
    fig.add_trace(go.Bar(
        x=[labels[0]],
        y=[base_value],
        marker=dict(color='lightgray'),
        name='Base',
        hovertemplate='%{x}<br>Value: %{y:.4f}<extra></extra>'
    ))

    # Feature contributions
    for i, (label, val) in enumerate(zip(labels[1:-1], values)):
        color = '#ff6b6b' if val < 0 else '#51cf66'
        fig.add_trace(go.Bar(
            x=[label],
            y=[abs(val)],
            base=cumulative_values[i] if val > 0 else cumulative_values[i] - abs(val),
            marker=dict(color=color),
            name=label,
            hovertemplate=f'{label}<br>SHAP: {val:+.4f}<extra></extra>'
        ))

    # Final prediction
    fig.add_trace(go.Bar(
        x=[labels[-1]],
        y=[cumulative_values[-1]],
        marker=dict(color='steelblue'),
        name='Prediction',
        hovertemplate='%{x}<br>Value: %{y:.4f}<extra></extra>'
    ))

    fig.update_layout(
        title=f'SHAP Waterfall Plot - Instance {instance_idx}',
        xaxis_title='',
        yaxis_title='Model output value',
        height=500,
        showlegend=False,
        plot_bgcolor='rgba(240,240,240,0.3)',
        xaxis=dict(tickangle=-45),
        yaxis=dict(gridcolor='rgba(200,200,200,0.2)')
    )

    return json.loads(fig.to_json())
