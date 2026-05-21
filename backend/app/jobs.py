"""In-memory job store for background analysis tasks (prototype/demo only).

Each job is keyed by a UUID string and holds progress state that the
frontend polls via GET /api/progress/{job_id}.

This intentionally uses a plain dict rather than Redis or Celery so the
solution remains dependency-free and easy to understand for a capstone demo.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

# Module-level store: job_id -> job dict.
# Lives as long as the uvicorn worker process lives.
jobs: Dict[str, Dict[str, Any]] = {}


def create_job() -> str:
    """Create a new job entry and return its ID."""
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 5,
        "message": "Job created, waiting to start...",
        "result": None,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return job_id


def update_job(job_id: str, status: str, progress: int, message: str) -> None:
    """Update a job's status, progress percentage, and human-readable message."""
    if job_id in jobs:
        jobs[job_id]["status"] = status
        jobs[job_id]["progress"] = progress
        jobs[job_id]["message"] = message


def complete_job(job_id: str, result: Any) -> None:
    """Mark a job as successfully completed and attach the full result payload."""
    if job_id in jobs:
        jobs[job_id].update(
            {
                "status": "completed",
                "progress": 100,
                "message": "Analysis complete",
                "result": result,
            }
        )


def fail_job(job_id: str, error: str) -> None:
    """Mark a job as failed and record a human-readable error message."""
    if job_id in jobs:
        jobs[job_id].update(
            {
                "status": "failed",
                "progress": 100,
                "message": "Analysis failed",
                "error": error,
            }
        )
