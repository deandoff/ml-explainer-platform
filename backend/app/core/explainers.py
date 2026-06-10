import shap
import lime
import lime.lime_tabular
import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, Optional
from app.core.model_loader import ModelLoader
from app.core.analysis_utils import (
    select_base_value,
    select_prediction_output,
    select_shap_output,
)

logger = logging.getLogger(__name__)

class SHAPExplainer:
    """SHAP-based model explainer"""

    def __init__(
        self,
        model: Any,
        model_type: str,
        background_data: pd.DataFrame,
        output_index: Optional[int] = None,
    ):
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
        self.output_index = output_index

        def predict_fn(X):
            return ModelLoader.predict(model, pd.DataFrame(X, columns=background_data.columns), model_type)

        if model_type in ["sklearn", "xgboost", "lightgbm", "catboost"]:
            try:
                # Use new Explainer API with masker for better performance
                self.explainer = shap.Explainer(model, background_data)
            except (TypeError, ValueError, AttributeError):
                logger.exception("SHAP Explainer failed; using KernelExplainer fallback")
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
        shap_values = select_shap_output(
            self.explainer.shap_values(instance.values),
            self.output_index,
        )
        shap_values_flat = shap_values[0]

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

        base_value = select_base_value(
            getattr(self.explainer, "expected_value", 0.0),
            self.output_index,
        )

        return {
            "shap_values": shap_values_flat.tolist(),
            "feature_importance": feature_importance,
            "base_value": base_value,
            "feature_names": instance.columns.tolist(),
            "explained_output": self.output_index,
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
        sample_data = data.sample(min(max_samples, len(data)), random_state=42)
        shap_values = select_shap_output(
            self.explainer.shap_values(sample_data.values),
            self.output_index,
        )

        # Calculate mean absolute SHAP values
        mean_shap = np.abs(shap_values).mean(axis=0)

        # Flatten if needed
        if isinstance(mean_shap, np.ndarray) and mean_shap.ndim > 1:
            mean_shap = mean_shap.flatten()

        # Convert to Python float explicitly
        feature_importance = {}
        for i, feature in enumerate(data.columns):
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
            "feature_names": data.columns.tolist(),
            "explained_output": self.output_index,
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
            discretize_continuous=True,
            random_state=42,
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
            num_features=num_features,
            top_labels=1,
        )

        prediction_proba = np.asarray(explanation.predict_proba)
        predicted_class = int(np.argmax(prediction_proba))
        intercept = float(explanation.intercept[predicted_class])
        local_prediction = float(np.asarray(explanation.local_pred).reshape(-1)[0])
        feature_importance = {
            feature: float(weight)
            for feature, weight in explanation.as_list(label=predicted_class)
        }

        return {
            "feature_importance": feature_importance,
            "prediction_proba": prediction_proba.tolist(),
            "predicted_class": predicted_class,
            "intercept": intercept,
            "local_prediction": local_prediction,
            "local_fidelity": float(explanation.score),
            "feature_names": instance.columns.tolist(),
        }
