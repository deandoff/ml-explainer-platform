from pathlib import Path
from typing import Optional


MODEL_EXTENSIONS = {
    "sklearn": ".pkl",
    "xgboost": ".pkl",
    "lightgbm": ".pkl",
    "catboost": ".pkl",
    "pytorch": ".pt",
    "tensorflow": ".keras",
    "onnx": ".onnx",
}


def sanitize_filename(filename: Optional[str]) -> Optional[str]:
    if not filename:
        return None

    safe_name = Path(filename.replace("\\", "/")).name.strip()
    return safe_name or None


def dataset_download_filename(
    name: str,
    original_filename: Optional[str],
) -> str:
    safe_original = sanitize_filename(original_filename)
    if safe_original:
        return safe_original

    safe_name = sanitize_filename(name) or "dataset"
    return safe_name if Path(safe_name).suffix else f"{safe_name}.csv"


def model_download_filename(
    name: str,
    model_type: str,
    original_filename: Optional[str],
) -> str:
    safe_original = sanitize_filename(original_filename)
    if safe_original:
        return safe_original

    safe_name = sanitize_filename(name) or "model"
    if Path(safe_name).suffix:
        return safe_name

    extension = MODEL_EXTENSIONS.get(model_type, ".bin")
    return f"{safe_name}{extension}"
