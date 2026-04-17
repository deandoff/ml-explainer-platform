import joblib
import pickle
import tempfile
import os
from typing import Any, Dict, Optional
import numpy as np
import pandas as pd

# ML frameworks
try:
    import torch
except ImportError:
    torch = None

try:
    import tensorflow as tf
except ImportError:
    tf = None

try:
    import onnxruntime as ort
except ImportError:
    ort = None


class ModelLoader:
    """Universal model loader supporting multiple ML frameworks"""

    @staticmethod
    def load_model(file_path: str, model_type: str) -> Any:
        """
        Load ML model from file

        Args:
            file_path: Path to model file
            model_type: Type of model (sklearn, xgboost, pytorch, tensorflow, onnx)

        Returns:
            Loaded model object
        """
        if model_type in ["sklearn", "xgboost", "lightgbm", "catboost"]:
            return joblib.load(file_path)

        elif model_type == "pytorch":
            if torch is None:
                raise ImportError("PyTorch is not installed")
            return torch.load(file_path, map_location=torch.device('cpu'))

        elif model_type == "tensorflow":
            if tf is None:
                raise ImportError("TensorFlow is not installed")
            return tf.keras.models.load_model(file_path)

        elif model_type == "onnx":
            if ort is None:
                raise ImportError("ONNX Runtime is not installed")
            return ort.InferenceSession(file_path)

        else:
            # Try generic pickle
            with open(file_path, 'rb') as f:
                return pickle.load(f)

    @staticmethod
    def predict(model: Any, data: pd.DataFrame, model_type: str) -> np.ndarray:
        """
        Make predictions using loaded model

        Args:
            model: Loaded model object
            data: Input data
            model_type: Type of model

        Returns:
            Predictions array
        """
        if model_type in ["sklearn", "xgboost", "lightgbm", "catboost"]:
            if hasattr(model, 'predict_proba'):
                return model.predict_proba(data)
            return model.predict(data)

        elif model_type == "pytorch":
            if torch is None:
                raise ImportError("PyTorch is not installed")
            model.eval()
            with torch.no_grad():
                tensor_data = torch.FloatTensor(data.values)
                predictions = model(tensor_data)
                return predictions.numpy()

        elif model_type == "tensorflow":
            if tf is None:
                raise ImportError("TensorFlow is not installed")
            return model.predict(data.values)

        elif model_type == "onnx":
            if ort is None:
                raise ImportError("ONNX Runtime is not installed")
            input_name = model.get_inputs()[0].name
            predictions = model.run(None, {input_name: data.values.astype(np.float32)})
            return predictions[0]

        else:
            # Generic prediction
            if hasattr(model, 'predict_proba'):
                return model.predict_proba(data)
            return model.predict(data)
