import importlib
import joblib
import pickle
from typing import Any
import numpy as np
import pandas as pd


class ModelLoader:
    """Universal model loader supporting multiple ML frameworks"""

    @staticmethod
    def _import_dependency(module_name: str, display_name: str) -> Any:
        try:
            return importlib.import_module(module_name)
        except ImportError as exc:
            raise ImportError(f"{display_name} is not installed") from exc

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
            torch = ModelLoader._import_dependency("torch", "PyTorch")
            return torch.load(file_path, map_location=torch.device('cpu'))

        elif model_type == "tensorflow":
            tf = ModelLoader._import_dependency("tensorflow", "TensorFlow")
            return tf.keras.models.load_model(file_path)

        elif model_type == "onnx":
            ort = ModelLoader._import_dependency("onnxruntime", "ONNX Runtime")
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
            torch = ModelLoader._import_dependency("torch", "PyTorch")
            model.eval()
            with torch.no_grad():
                tensor_data = torch.FloatTensor(data.values)
                predictions = model(tensor_data)
                return predictions.numpy()

        elif model_type == "tensorflow":
            ModelLoader._import_dependency("tensorflow", "TensorFlow")
            return model.predict(data.values)

        elif model_type == "onnx":
            ModelLoader._import_dependency("onnxruntime", "ONNX Runtime")
            input_name = model.get_inputs()[0].name
            predictions = model.run(None, {input_name: data.values.astype(np.float32)})
            return predictions[0]

        else:
            # Generic prediction
            if hasattr(model, 'predict_proba'):
                return model.predict_proba(data)
            return model.predict(data)
