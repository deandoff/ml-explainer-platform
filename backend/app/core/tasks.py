from celery import Task
from app.core.celery_app import celery_app
from app.core.model_loader import ModelLoader
from app.core.explainers import SHAPExplainer, LIMEExplainer
from app.core.visualizations import (
    generate_lime_bar_chart,
    generate_confusion_matrix,
    generate_metrics_cards,
)
from app.core.shap_native_plots import (
    generate_shap_summary_plot_native,
    generate_shap_waterfall_native,
    generate_shap_dependence_native,
    generate_shap_bar_plot_native
)
from app.core.shap_interactive import (
    prepare_shap_interactive_data,
)
from app.core.analysis_utils import (
    classification_outputs,
    explained_output_label,
    resolve_class_metadata,
    select_base_value,
    select_prediction_output,
    select_shap_output,
    split_features_and_target,
)
from app.services.storage import storage_service
from app.core.database import SessionLocal
from app.models.models import Analysis, AnalysisStatus
import pandas as pd
import numpy as np
import shap
import tempfile
import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def update_analysis_record(
    analysis_id: str,
    status: AnalysisStatus,
    result_s3_key: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    database = SessionLocal()
    try:
        analysis = database.query(Analysis).filter(Analysis.id == analysis_id).first()
        if not analysis:
            return

        analysis.status = status
        analysis.result_s3_key = result_s3_key
        analysis.error_message = error_message
        if status in {AnalysisStatus.COMPLETED, AnalysisStatus.FAILED}:
            analysis.completed_at = datetime.utcnow()
        database.commit()
    finally:
        database.close()


@celery_app.task(bind=True, name="app.core.tasks.run_shap_analysis")
def run_shap_analysis(
    self: Task,
    model_s3_key: str,
    dataset_s3_key: str,
    model_type: str,
    analysis_id: str,
    user_id: str = None,
    class_labels: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Run SHAP analysis on model and dataset

    Args:
        model_s3_key: S3 key for model file
        dataset_s3_key: S3 key for dataset file
        model_type: Type of ML model
        analysis_id: Analysis record ID (UUID string)
        user_id: User ID for storage path isolation

    Returns:
        Dictionary with SHAP results
    """
    try:
        self.update_state(state='PROGRESS', meta={'status': 'Downloading model and data'})

        # Download model
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as model_file:
            storage_service.download_file(model_s3_key, model_file.name)
            model = ModelLoader.load_model(model_file.name, model_type)
            os.unlink(model_file.name)

        # Download dataset
        with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as data_file:
            storage_service.download_file(dataset_s3_key, data_file.name)
            data = pd.read_csv(data_file.name)
            os.unlink(data_file.name)

        features, y_true = split_features_and_target(data)
        model_predictions = ModelLoader.predict(model, features, model_type)
        _, output_index = select_prediction_output(model_predictions)
        class_values, resolved_class_labels = resolve_class_metadata(
            model,
            model_predictions,
            class_labels,
        )
        output_label = explained_output_label(
            resolved_class_labels,
            output_index,
        )

        self.update_state(state='PROGRESS', meta={'status': 'Initializing SHAP explainer'})

        background_data = features.sample(min(100, len(features)), random_state=42)
        explainer = SHAPExplainer(
            model,
            model_type,
            background_data,
            output_index=output_index,
        )

        self.update_state(state='PROGRESS', meta={'status': 'Computing SHAP values'})

        global_importance = explainer.explain_global(features, max_samples=100)

        instance_explanations = []
        for idx in range(min(5, len(features))):
            try:
                instance = features.iloc[[idx]]
                explanation = explainer.explain_instance(instance)
                instance_explanations.append({
                    'index': idx,
                    'explanation': explanation
                })
            except Exception:
                logger.exception(
                    "Failed to explain SHAP instance %s for analysis %s",
                    idx,
                    analysis_id
                )
                continue

        self.update_state(state='PROGRESS', meta={'status': 'Generating visualizations'})

        visualizations = {}
        sample_data = features.sample(min(100, len(features)), random_state=42)

        # Use the Explanation API when available and normalize it to one model output.
        try:
            raw_explanation = explainer.explainer(sample_data)
            shap_values_array = select_shap_output(
                raw_explanation.values,
                output_index,
            )
        except Exception:
            logger.info(
                "SHAP Explanation API unavailable for analysis %s; using shap_values",
                analysis_id,
            )
            shap_values_array = select_shap_output(
                explainer.explainer.shap_values(sample_data.values),
                output_index,
            )

        feature_names = features.columns.tolist()
        base_value = select_base_value(
            getattr(explainer.explainer, "expected_value", 0.0),
            output_index,
        )
        shap_explanation = shap.Explanation(
            values=shap_values_array,
            base_values=np.full(len(sample_data), base_value),
            data=sample_data.values,
            feature_names=feature_names,
        )

        visualizations['shap_summary_plot'] = generate_shap_summary_plot_native(
            shap_values=shap_explanation,
            feature_values=sample_data.values,
            feature_names=feature_names,
        )
        visualizations['feature_importance_bar'] = generate_shap_bar_plot_native(
            shap_values=shap_values_array,
            feature_names=feature_names,
        )

        most_important_idx = int(np.argmax(np.abs(shap_values_array).mean(axis=0)))
        visualizations['shap_dependence_plot'] = generate_shap_dependence_native(
            shap_values=shap_values_array,
            feature_values=sample_data.values,
            feature_names=feature_names,
            feature_idx=most_important_idx,
        )
        visualizations['shap_waterfall'] = generate_shap_waterfall_native(
            shap_values=shap_values_array,
            feature_values=sample_data.values,
            feature_names=feature_names,
            base_value=base_value,
            instance_idx=0,
        )

        self.update_state(state='PROGRESS', meta={'status': 'Preparing interactive data'})

        sample_predictions, _ = select_prediction_output(
            ModelLoader.predict(model, sample_data, model_type),
            output_index,
        )
        visualizations['interactive_data'] = prepare_shap_interactive_data(
            shap_values=shap_values_array,
            feature_values=sample_data.values,
            feature_names=feature_names,
            predictions=sample_predictions,
            base_value=base_value,
            sample_indices=sample_data.index.tolist(),
            output_index=output_index,
        )

        if y_true is not None:
            y_pred_class, y_pred_proba = classification_outputs(
                model_predictions,
                class_values,
            )
            visualizations['confusion_matrix'] = generate_confusion_matrix(
                y_true=y_true,
                y_pred=y_pred_class,
                class_names=resolved_class_labels,
                class_values=class_values,
            )
            visualizations['metrics'] = generate_metrics_cards(
                y_true=y_true,
                y_pred=y_pred_class,
                y_pred_proba=y_pred_proba,
            )

        # Prepare results
        results = {
            'global_importance': global_importance,
            'instance_explanations': instance_explanations,
            'visualizations': visualizations,
            'num_samples': len(data),
            'num_features': len(features.columns),
            'target_column': 'target' if y_true is not None else None,
            'explained_output': output_index,
            'explained_output_label': output_label,
            'class_values': class_values,
            'class_labels': resolved_class_labels,
        }

        if user_id:
            result_s3_key = f"artifacts/analyses/{user_id}/shap_{analysis_id}.json"
        else:
            result_s3_key = f"artifacts/analyses/shap_{analysis_id}.json"

        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as result_file:
            json.dump(results, result_file)
            result_file.flush()
            storage_service.upload_file(result_file.name, result_s3_key)
            os.unlink(result_file.name)

        update_analysis_record(
            analysis_id,
            AnalysisStatus.COMPLETED,
            result_s3_key=result_s3_key,
        )
        return {
            'status': 'completed',
            'result_s3_key': result_s3_key,
            'results': results
        }

    except Exception as exc:
        try:
            update_analysis_record(
                analysis_id,
                AnalysisStatus.FAILED,
                error_message=str(exc),
            )
        except Exception:
            logger.exception("Failed to persist SHAP failure status for %s", analysis_id)
        logger.exception("SHAP analysis %s failed", analysis_id)
        raise

@celery_app.task(bind=True, name="app.core.tasks.run_lime_analysis")
def run_lime_analysis(
    self: Task,
    model_s3_key: str,
    dataset_s3_key: str,
    model_type: str,
    analysis_id: str,
    user_id: str = None,
    class_labels: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Run LIME analysis on model and dataset

    Args:
        model_s3_key: S3 key for model file
        dataset_s3_key: S3 key for dataset file
        model_type: Type of ML model
        analysis_id: Analysis record ID (UUID string)
        user_id: User ID for storage path isolation

    Returns:
        Dictionary with LIME results
    """
    try:
        self.update_state(state='PROGRESS', meta={'status': 'Downloading model and data'})

        # Download model
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as model_file:
            storage_service.download_file(model_s3_key, model_file.name)
            model = ModelLoader.load_model(model_file.name, model_type)
            os.unlink(model_file.name)

        # Download dataset
        with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as data_file:
            storage_service.download_file(dataset_s3_key, data_file.name)
            data = pd.read_csv(data_file.name)
            os.unlink(data_file.name)

        features, y_true = split_features_and_target(data)
        model_predictions = ModelLoader.predict(model, features, model_type)
        class_values, resolved_class_labels = resolve_class_metadata(
            model,
            model_predictions,
            class_labels,
        )

        self.update_state(state='PROGRESS', meta={'status': 'Initializing LIME explainer'})

        training_data = features.sample(min(1000, len(features)), random_state=42)
        explainer = LIMEExplainer(model, model_type, training_data)

        self.update_state(state='PROGRESS', meta={'status': 'Computing LIME explanations'})

        # Compute explanations for first few instances
        instance_explanations = []
        for idx in range(min(10, len(features))):
            instance = features.iloc[[idx]]
            explanation = explainer.explain_instance(instance, num_features=10)
            instance_explanations.append({
                'index': idx,
                'explanation': explanation
            })

        self.update_state(state='PROGRESS', meta={'status': 'Generating visualizations'})

        visualizations = {}

        if instance_explanations:
            first_explanation = instance_explanations[0]['explanation']
            visualizations['lime_bar_chart'] = generate_lime_bar_chart(
                first_explanation['feature_importance']
            )

        if y_true is not None:
            y_pred_class, y_pred_proba = classification_outputs(
                model_predictions,
                class_values,
            )
            visualizations['confusion_matrix'] = generate_confusion_matrix(
                y_true=y_true,
                y_pred=y_pred_class,
                class_names=resolved_class_labels,
                class_values=class_values,
            )
            visualizations['metrics'] = generate_metrics_cards(
                y_true=y_true,
                y_pred=y_pred_class,
                y_pred_proba=y_pred_proba,
            )

        # Prepare results
        results = {
            'instance_explanations': instance_explanations,
            'visualizations': visualizations,
            'num_samples': len(data),
            'num_features': len(features.columns),
            'target_column': 'target' if y_true is not None else None,
            'class_values': class_values,
            'class_labels': resolved_class_labels,
        }

        if user_id:
            result_s3_key = f"artifacts/analyses/{user_id}/lime_{analysis_id}.json"
        else:
            result_s3_key = f"artifacts/analyses/lime_{analysis_id}.json"

        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as result_file:
            json.dump(results, result_file)
            result_file.flush()
            storage_service.upload_file(result_file.name, result_s3_key)
            os.unlink(result_file.name)

        update_analysis_record(
            analysis_id,
            AnalysisStatus.COMPLETED,
            result_s3_key=result_s3_key,
        )
        return {
            'status': 'completed',
            'result_s3_key': result_s3_key,
            'results': results
        }

    except Exception as exc:
        try:
            update_analysis_record(
                analysis_id,
                AnalysisStatus.FAILED,
                error_message=str(exc),
            )
        except Exception:
            logger.exception("Failed to persist LIME failure status for %s", analysis_id)
        logger.exception("LIME analysis %s failed", analysis_id)
        raise
