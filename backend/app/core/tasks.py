from celery import Task
from app.core.celery_app import celery_app
from app.core.model_loader import ModelLoader
from app.core.explainers import SHAPExplainer, LIMEExplainer
from app.core.visualizations import (
    generate_shap_summary_plot,
    generate_lime_bar_chart,
    generate_confusion_matrix,
    generate_metrics_cards,
    generate_feature_importance_bar
)
from app.core.shap_native_plots import (
    generate_shap_summary_plot_native,
    generate_shap_waterfall_native,
    generate_shap_dependence_native,
    generate_shap_bar_plot_native
)
from app.services.storage import storage_service
import pandas as pd
import numpy as np
import shap
import tempfile
import os
import json
from typing import Dict, Any


@celery_app.task(bind=True, name="app.core.tasks.run_shap_analysis")
def run_shap_analysis(
    self: Task,
    model_s3_key: str,
    dataset_s3_key: str,
    model_type: str,
    analysis_id: str,
    user_id: str = None
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
        # Update task state
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

        # Update state
        self.update_state(state='PROGRESS', meta={'status': 'Initializing SHAP explainer'})

        # Initialize SHAP explainer
        background_data = data.sample(min(100, len(data)))
        explainer = SHAPExplainer(model, model_type, background_data)

        # Update state
        self.update_state(state='PROGRESS', meta={'status': 'Computing SHAP values'})

        # Compute global importance
        try:
            global_importance = explainer.explain_global(data, max_samples=100)
        except Exception as e:
            print(f"Error in explain_global: {e}")
            import traceback
            traceback.print_exc()
            raise

        # Compute explanations for first few instances
        instance_explanations = []
        for idx in range(min(5, len(data))):
            try:
                instance = data.iloc[[idx]]
                explanation = explainer.explain_instance(instance)
                instance_explanations.append({
                    'index': idx,
                    'explanation': explanation
                })
            except Exception as e:
                print(f"Error explaining instance {idx}: {e}")
                import traceback
                traceback.print_exc()
                # Continue with other instances
                continue

        # Update state
        self.update_state(state='PROGRESS', meta={'status': 'Generating visualizations'})

        # Generate visualizations
        visualizations = {}

        try:
            # 1. Compute SHAP values using new API
            sample_data = data.sample(min(100, len(data)))

            # Use new SHAP API: explainer(X) returns Explanation object
            try:
                shap_explanation = explainer.explainer(sample_data)
                shap_values_array = shap_explanation.values

                # Handle multi-output case (multi-class or multi-target)
                if len(shap_values_array.shape) == 3:
                    # Shape is (n_samples, n_features, n_outputs) - take first output
                    shap_values_array = shap_values_array[:, :, 0]
                    # Recreate explanation with 2D values
                    shap_explanation = shap.Explanation(
                        values=shap_values_array,
                        data=sample_data.values,
                        feature_names=data.columns.tolist()
                    )
            except Exception as e:
                print(f"Error with new SHAP API, falling back to old API: {e}")
                # Fallback to old API if new one fails
                shap_values_array = explainer.explainer.shap_values(sample_data.values)
                # Handle multi-class case
                if isinstance(shap_values_array, list):
                    shap_values_array = shap_values_array[0]
                elif len(shap_values_array.shape) == 3:
                    shap_values_array = shap_values_array[:, :, 0]
                # Create Explanation object manually
                shap_explanation = shap.Explanation(
                    values=shap_values_array,
                    data=sample_data.values,
                    feature_names=data.columns.tolist()
                )
                shap_values_array = shap_explanation.values

            # Ensure 2D array
            if isinstance(shap_values_array, np.ndarray):
                if len(shap_values_array.shape) == 1:
                    shap_values_array = shap_values_array.reshape(1, -1)

            # 1. SHAP Summary Plot (beeswarm) - pass Explanation object
            visualizations['shap_summary_plot'] = generate_shap_summary_plot_native(
                shap_values=shap_explanation,
                feature_values=sample_data.values,
                feature_names=data.columns.tolist()
            )

            # 2. Feature Importance Bar (native SHAP bar plot)
            visualizations['feature_importance_bar'] = generate_shap_bar_plot_native(
                shap_values=shap_values_array,
                feature_names=data.columns.tolist()
            )

            # 3. SHAP Dependence Plot (native, for most important feature)
            most_important_idx = np.argmax(np.abs(shap_values_array).mean(axis=0))
            visualizations['shap_dependence_plot'] = generate_shap_dependence_native(
                shap_values=shap_values_array,
                feature_values=sample_data.values,
                feature_names=data.columns.tolist(),
                feature_idx=int(most_important_idx)
            )

            # 4. SHAP Waterfall (native, for first instance)
            base_value = explainer.explainer.expected_value
            if isinstance(base_value, np.ndarray):
                base_value = float(base_value[0])
            else:
                base_value = float(base_value)

            visualizations['shap_waterfall'] = generate_shap_waterfall_native(
                shap_values=shap_values_array,
                feature_values=sample_data.values,
                feature_names=data.columns.tolist(),
                base_value=base_value,
                instance_idx=0
            )

            # 3. Model Performance Metrics (if we can get predictions)
            try:
                y_pred = ModelLoader.predict(model, data, model_type)

                # If we have true labels (assume last column or 'target')
                if 'target' in data.columns:
                    y_true = data['target'].values
                    y_pred_class = (y_pred > 0.5).astype(int) if len(y_pred.shape) == 1 else np.argmax(y_pred, axis=1)

                    # Confusion Matrix
                    visualizations['confusion_matrix'] = generate_confusion_matrix(
                        y_true=y_true,
                        y_pred=y_pred_class
                    )

                    # Metrics
                    visualizations['metrics'] = generate_metrics_cards(
                        y_true=y_true,
                        y_pred=y_pred_class,
                        y_pred_proba=y_pred if len(y_pred.shape) > 1 else None
                    )
            except Exception as e:
                print(f"Could not generate model metrics: {e}")
                # Not critical, continue without metrics

        except Exception as e:
            print(f"Error generating visualizations: {e}")
            import traceback
            traceback.print_exc()
            # Continue without visualizations

        # Prepare results
        results = {
            'global_importance': global_importance,
            'instance_explanations': instance_explanations,
            'visualizations': visualizations,
            'num_samples': len(data),
            'num_features': len(data.columns)
        }

        # Save results to storage with user_id in path
        if user_id:
            result_s3_key = f"artifacts/analyses/{user_id}/shap_{analysis_id}.json"
        else:
            result_s3_key = f"artifacts/analyses/shap_{analysis_id}.json"

        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as result_file:
            json.dump(results, result_file)
            result_file.flush()
            storage_service.upload_file(result_file.name, result_s3_key)
            os.unlink(result_file.name)

        return {
            'status': 'completed',
            'result_s3_key': result_s3_key,
            'results': results
        }

    except Exception as e:
        return {
            'status': 'failed',
            'error': str(e)
        }


@celery_app.task(bind=True, name="app.core.tasks.run_lime_analysis")
def run_lime_analysis(
    self: Task,
    model_s3_key: str,
    dataset_s3_key: str,
    model_type: str,
    analysis_id: str,
    user_id: str = None
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
        # Update task state
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

        # Update state
        self.update_state(state='PROGRESS', meta={'status': 'Initializing LIME explainer'})

        # Initialize LIME explainer
        training_data = data.sample(min(1000, len(data)))
        explainer = LIMEExplainer(model, model_type, training_data)

        # Update state
        self.update_state(state='PROGRESS', meta={'status': 'Computing LIME explanations'})

        # Compute explanations for first few instances
        instance_explanations = []
        for idx in range(min(10, len(data))):
            instance = data.iloc[[idx]]
            explanation = explainer.explain_instance(instance, num_features=10)
            instance_explanations.append({
                'index': idx,
                'explanation': explanation
            })

        # Update state
        self.update_state(state='PROGRESS', meta={'status': 'Generating visualizations'})

        # Generate visualizations
        visualizations = {}

        try:
            # LIME Bar Chart for first instance
            if instance_explanations:
                first_explanation = instance_explanations[0]['explanation']
                visualizations['lime_bar_chart'] = generate_lime_bar_chart(
                    first_explanation['feature_importance']
                )

            # Model Performance Metrics (if we can get predictions)
            try:
                y_pred = ModelLoader.predict(model, data, model_type)

                # If we have true labels
                if 'target' in data.columns:
                    y_true = data['target'].values
                    y_pred_class = (y_pred > 0.5).astype(int) if len(y_pred.shape) == 1 else np.argmax(y_pred, axis=1)

                    # Confusion Matrix
                    visualizations['confusion_matrix'] = generate_confusion_matrix(
                        y_true=y_true,
                        y_pred=y_pred_class
                    )

                    # Metrics
                    visualizations['metrics'] = generate_metrics_cards(
                        y_true=y_true,
                        y_pred=y_pred_class,
                        y_pred_proba=y_pred if len(y_pred.shape) > 1 else None
                    )
            except Exception as e:
                print(f"Could not generate model metrics: {e}")

        except Exception as e:
            print(f"Error generating visualizations: {e}")
            import traceback
            traceback.print_exc()

        # Prepare results
        results = {
            'instance_explanations': instance_explanations,
            'visualizations': visualizations,
            'num_samples': len(data),
            'num_features': len(data.columns)
        }

        # Save results to storage with user_id in path
        if user_id:
            result_s3_key = f"artifacts/analyses/{user_id}/lime_{analysis_id}.json"
        else:
            result_s3_key = f"artifacts/analyses/lime_{analysis_id}.json"

        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as result_file:
            json.dump(results, result_file)
            result_file.flush()
            storage_service.upload_file(result_file.name, result_s3_key)
            os.unlink(result_file.name)

        return {
            'status': 'completed',
            'result_s3_key': result_s3_key,
            'results': results
        }

    except Exception as e:
        return {
            'status': 'failed',
            'error': str(e)
        }
