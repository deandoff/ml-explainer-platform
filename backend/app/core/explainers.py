import shap
import lime
import lime.lime_tabular
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
import json
import plotly.graph_objects as go
from app.core.model_loader import ModelLoader


class SHAPExplainer:
    """SHAP-based model explainer"""

    def __init__(self, model: Any, model_type: str, background_data: pd.DataFrame):
        """
        Initialize SHAP explainer

        Args:
            model: Loaded ML model
            model_type: Type of model
            background_data: Background dataset for SHAP
        """
        self.model = model
        self.model_type = model_type
        self.background_data = background_data

        # Create prediction function
        def predict_fn(X):
            return ModelLoader.predict(model, pd.DataFrame(X, columns=background_data.columns), model_type)

        # Initialize appropriate SHAP explainer using new API
        if model_type in ["sklearn", "xgboost", "lightgbm", "catboost"]:
            try:
                # Use new Explainer API with masker for better performance
                self.explainer = shap.Explainer(model, background_data)
            except:
                # Fallback to KernelExplainer for unsupported models
                self.explainer = shap.KernelExplainer(predict_fn, background_data.values)
        else:
            self.explainer = shap.KernelExplainer(predict_fn, background_data.values)

    def explain_instance(self, instance: pd.DataFrame) -> Dict[str, Any]:
        """
        Explain single prediction

        Args:
            instance: Single data instance

        Returns:
            Dictionary with SHAP values and visualization data
        """
        shap_values = self.explainer.shap_values(instance.values)

        # Handle multi-class case
        if isinstance(shap_values, list):
            shap_values = shap_values[0]

        # Ensure shap_values is numpy array
        if not isinstance(shap_values, np.ndarray):
            shap_values = np.array(shap_values)

        # Flatten to 1D if needed
        shap_values_flat = shap_values.flatten()

        # Extract feature importance safely
        feature_importance = {}
        for i, feature in enumerate(instance.columns):
            if i < len(shap_values_flat):
                value = shap_values_flat[i]
                # Convert to Python float - handle all numpy types
                if isinstance(value, np.ndarray):
                    if value.size == 1:
                        feature_importance[feature] = float(value.flat[0])
                    else:
                        feature_importance[feature] = float(value[0])
                elif hasattr(value, 'item'):
                    feature_importance[feature] = value.item()
                else:
                    feature_importance[feature] = float(value)

        # Get base value
        if hasattr(self.explainer, 'expected_value'):
            base_value = self.explainer.expected_value
            # Handle list case for multi-class
            if isinstance(base_value, (list, np.ndarray)):
                if len(base_value) > 0:
                    base_value = base_value[0]
                    if hasattr(base_value, 'item'):
                        base_value = base_value.item()
                    else:
                        base_value = float(base_value)
                else:
                    base_value = 0.0
            else:
                if hasattr(base_value, 'item'):
                    base_value = base_value.item()
                else:
                    base_value = float(base_value)
        else:
            base_value = 0.0

        return {
            "shap_values": shap_values.tolist(),
            "feature_importance": feature_importance,
            "base_value": base_value,
            "feature_names": instance.columns.tolist()
        }

    def explain_global(self, data: pd.DataFrame, max_samples: int = 100) -> Dict[str, Any]:
        """
        Generate global feature importance

        Args:
            data: Dataset to analyze
            max_samples: Maximum number of samples to use

        Returns:
            Global feature importance
        """
        sample_data = data.sample(min(max_samples, len(data)))
        shap_values = self.explainer.shap_values(sample_data.values)

        if isinstance(shap_values, list):
            shap_values = shap_values[0]

        # Ensure shap_values is 2D
        if isinstance(shap_values, np.ndarray):
            if len(shap_values.shape) == 1:
                shap_values = shap_values.reshape(1, -1)

        # Calculate mean absolute SHAP values
        mean_shap = np.abs(shap_values).mean(axis=0)

        # Flatten if needed
        if isinstance(mean_shap, np.ndarray) and mean_shap.ndim > 1:
            mean_shap = mean_shap.flatten()

        # Convert to Python float explicitly
        feature_importance = {}
        for i, feature in enumerate(data.columns):
            # Extract scalar value safely
            if isinstance(mean_shap, np.ndarray):
                value = mean_shap[i]
                # Convert numpy scalar to Python float
                if hasattr(value, 'item'):
                    feature_importance[feature] = value.item()
                else:
                    feature_importance[feature] = float(value)
            else:
                feature_importance[feature] = float(mean_shap)

        # Sort by importance
        sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)

        return {
            "feature_importance": dict(sorted_features),
            "feature_names": data.columns.tolist()
        }


class LIMEExplainer:
    """LIME-based model explainer"""

    def __init__(self, model: Any, model_type: str, training_data: pd.DataFrame):
        """
        Initialize LIME explainer

        Args:
            model: Loaded ML model
            model_type: Type of model
            training_data: Training dataset for LIME
        """
        self.model = model
        self.model_type = model_type
        self.training_data = training_data

        # Create prediction function
        def predict_fn(X):
            predictions = ModelLoader.predict(model, pd.DataFrame(X, columns=training_data.columns), model_type)
            # Ensure 2D output for LIME
            if len(predictions.shape) == 1:
                predictions = np.column_stack([1 - predictions, predictions])
            return predictions

        self.explainer = lime.lime_tabular.LimeTabularExplainer(
            training_data.values,
            feature_names=training_data.columns.tolist(),
            mode='classification',
            discretize_continuous=True
        )

        self.predict_fn = predict_fn

    def explain_instance(self, instance: pd.DataFrame, num_features: int = 10) -> Dict[str, Any]:
        """
        Explain single prediction

        Args:
            instance: Single data instance
            num_features: Number of top features to show

        Returns:
            Dictionary with LIME explanation
        """
        explanation = self.explainer.explain_instance(
            instance.values[0],
            self.predict_fn,
            num_features=num_features
        )

        # Extract feature importance
        feature_importance = {
            feature: float(weight)
            for feature, weight in explanation.as_list()
        }

        return {
            "feature_importance": feature_importance,
            "prediction_proba": explanation.predict_proba.tolist(),
            "feature_names": instance.columns.tolist()
        }
