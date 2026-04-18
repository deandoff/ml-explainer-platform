from celery import Task
from app.core.celery_app import celery_app
from app.core.model_loader import ModelLoader
from app.core.explainers import SHAPExplainer, LIMEExplainer
from app.services.storage import storage_service
import pandas as pd
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

        # Prepare results
        results = {
            'global_importance': global_importance,
            'instance_explanations': instance_explanations,
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

        # Prepare results
        results = {
            'instance_explanations': instance_explanations,
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
