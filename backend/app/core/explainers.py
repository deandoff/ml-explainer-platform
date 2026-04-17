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

        # Initialize appropriate SHAP explainer
        if model_type in ["sklearn", "xgboost", "lightgbm", "catboost"]:
            try:
                self.explainer = shap.TreeExplainer(model)
            except:
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

        feature_importance = {
            feature: float(value)
            for feature, value in zip(instance.columns, shap_values[0])
        }

        return {
            "shap_values": shap_values.tolist(),
            "feature_importance": feature_importance,
            "base_value": float(self.explainer.expected_value) if hasattr(self.explainer, 'expected_value') else 0.0,
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

        # Calculate mean absolute SHAP values
        mean_shap = np.abs(shap_values).mean(axis=0)

        feature_importance = {
            feature: float(value)
            for feature, value in zip(data.columns, mean_shap)
        }

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
