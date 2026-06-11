import logging
from typing import Iterable, List

from sqlalchemy.orm import Session

from app.core.celery_app import celery_app
from app.models.models import Analysis, AnalysisStatus
from app.services.storage import storage_service


logger = logging.getLogger(__name__)


def delete_related_analyses(
    db: Session,
    analyses: Iterable[Analysis],
) -> List[str]:
    result_keys = []

    for analysis in analyses:
        if (
            analysis.celery_task_id
            and analysis.status in {AnalysisStatus.PENDING, AnalysisStatus.RUNNING}
        ):
            try:
                celery_app.control.revoke(
                    analysis.celery_task_id,
                    terminate=True,
                    signal="SIGTERM",
                )
            except Exception:
                logger.exception(
                    "Failed to revoke analysis task %s",
                    analysis.celery_task_id,
                )
        if analysis.result_s3_key:
            result_keys.append(analysis.result_s3_key)
        db.delete(analysis)

    return result_keys


def delete_storage_files(storage_keys: Iterable[str]) -> None:
    for storage_key in storage_keys:
        try:
            storage_service.delete_file(storage_key)
        except Exception:
            logger.exception("Failed to delete storage file %s", storage_key)
