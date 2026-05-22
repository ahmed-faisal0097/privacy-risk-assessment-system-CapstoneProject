from datetime import datetime, timezone
from threading import Lock
from typing import Any


ProgressPayload = dict[str, Any]

_progress_lock = Lock()
_progress_by_job: dict[str, ProgressPayload] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_progress(job_id: str | None) -> None:
    if not job_id:
        return

    now = _now_iso()
    with _progress_lock:
        _progress_by_job[job_id] = {
            "job_id": job_id,
            "activeStep": 0,
            "stepProgress": 0,
            "completed": False,
            "status": "running",
            "message": "Upload received.",
            "created_at": now,
            "updated_at": now,
        }


def update_progress(
    job_id: str | None,
    *,
    active_step: int,
    step_progress: int,
    message: str,
    completed: bool = False,
    status: str = "running",
) -> None:
    if not job_id:
        return

    clamped_progress = max(0, min(100, step_progress))
    with _progress_lock:
        current = _progress_by_job.get(job_id, {"job_id": job_id, "created_at": _now_iso()})
        current.update(
            {
                "activeStep": active_step,
                "stepProgress": clamped_progress,
                "completed": completed,
                "status": status,
                "message": message,
                "updated_at": _now_iso(),
            }
        )
        _progress_by_job[job_id] = current


def fail_progress(job_id: str | None, message: str) -> None:
    update_progress(
        job_id,
        active_step=0,
        step_progress=100,
        message=message,
        completed=True,
        status="failed",
    )


def get_progress(job_id: str) -> ProgressPayload | None:
    with _progress_lock:
        progress = _progress_by_job.get(job_id)
        return dict(progress) if progress else None
