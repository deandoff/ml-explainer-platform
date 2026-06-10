from typing import Any, Optional, Tuple

import numpy as np
import pandas as pd


TARGET_COLUMN = "target"


def split_features_and_target(
    data: pd.DataFrame,
) -> Tuple[pd.DataFrame, Optional[np.ndarray]]:
    if TARGET_COLUMN not in data.columns:
        return data, None

    features = data.drop(columns=[TARGET_COLUMN])
    if features.empty:
        raise ValueError("Dataset must contain at least one feature column")

    return features, data[TARGET_COLUMN].to_numpy()


def select_prediction_output(
    predictions: Any,
    output_index: Optional[int] = None,
) -> Tuple[np.ndarray, Optional[int]]:
    values = np.asarray(predictions)

    if values.ndim == 1:
        return values, None
    if values.ndim != 2:
        raise ValueError(f"Unexpected prediction shape: {values.shape}")

    if output_index is None:
        output_index = 1 if values.shape[1] == 2 else int(np.argmax(values.mean(axis=0)))
    if not 0 <= output_index < values.shape[1]:
        raise ValueError(
            f"Output index {output_index} is invalid for prediction shape {values.shape}"
        )

    return values[:, output_index], output_index


def select_shap_output(
    shap_values: Any,
    output_index: Optional[int],
) -> np.ndarray:
    if isinstance(shap_values, list):
        index = output_index if output_index is not None else 0
        if not 0 <= index < len(shap_values):
            raise ValueError(f"Output index {index} is invalid for SHAP output list")
        shap_values = shap_values[index]

    values = np.asarray(shap_values)
    if values.ndim == 3:
        index = output_index if output_index is not None else 0
        if not 0 <= index < values.shape[2]:
            raise ValueError(
                f"Output index {index} is invalid for SHAP shape {values.shape}"
            )
        values = values[:, :, index]

    if values.ndim == 1:
        values = values.reshape(1, -1)
    if values.ndim != 2:
        raise ValueError(f"Unexpected SHAP values shape: {values.shape}")

    return values


def select_base_value(base_values: Any, output_index: Optional[int]) -> float:
    values = np.asarray(base_values)
    if values.ndim == 0:
        return float(values)

    flat_values = values.reshape(-1)
    index = output_index if output_index is not None else 0
    if not 0 <= index < len(flat_values):
        raise ValueError(
            f"Output index {index} is invalid for base values shape {values.shape}"
        )

    return float(flat_values[index])


def classification_outputs(predictions: Any) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    values = np.asarray(predictions)
    if values.ndim == 1:
        return (values > 0.5).astype(int), None
    if values.ndim == 2:
        return np.argmax(values, axis=1), values
    raise ValueError(f"Unexpected prediction shape: {values.shape}")
