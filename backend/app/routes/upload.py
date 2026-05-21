from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from pathlib import Path
import pandas as pd
import logging

from app.services.validate import (
    save_upload_file,
    extract_columns,
    validate_quasi_and_sensitive_attributes,
)
from app.services.risk_evaluation import risk_evaluation
from app.database import AsyncSessionLocal
from app.repositories import (
    insert_dataset,
    insert_attributes,
    get_or_create_user,
    seed_risk_types,
    create_risk_evaluation,
    create_risk_result,
    update_risk_evaluation_overall_score,
    UNIQUENESS_RISK,
    RARE_COMBINATION_RISK,
    LINKAGE_REIDENTIFICATION_RISK,
    ATTRIBUTE_INFERENCE_RISK,
)
from app.jobs import create_job, update_job, complete_job, fail_job, jobs

logger = logging.getLogger(__name__)

router = APIRouter()

REAL_STORAGE_DIR = Path("storage/real")
SYNTHETIC_STORAGE_DIR = Path("storage/synthetic")

REAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
SYNTHETIC_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


# ── Background evaluation task ────────────────────────────────────────────────

async def run_evaluation_job(
    job_id: str,
    real_original_filename: str,
    real_content_type: str | None,
    real_stored_filename: str,
    real_path: Path,
    real_size: int,
    real_ext: str,
    synthetic_original_filename: str,
    synthetic_content_type: str | None,
    synthetic_stored_filename: str,
    synthetic_path: Path,
    synthetic_size: int,
    synthetic_ext: str,
    quasi_identifiers: list[str],
    sensitive_attributes: list[str],
) -> None:
    """Run the full evaluation pipeline in the background and update job progress."""

    try:
        # ── 20%: validate uploaded file formats + extract column names ────────
        update_job(job_id, "validating", 20, "Validating uploaded files...")
        logger.info("[JOB %s] Extracting columns from uploaded files", job_id)
        try:
            real_columns = extract_columns(real_path)
            synthetic_columns = extract_columns(synthetic_path)
        except HTTPException as exc:
            fail_job(job_id, str(exc.detail))
            _cleanup(real_path, synthetic_path)
            return

        # ── 30%: validate QI / SA selections against actual columns ──────────
        update_job(job_id, "validating", 30, "Validating quasi-identifiers and sensitive attributes...")
        logger.info("[JOB %s] Validating QIs/SAs", job_id)
        try:
            validated_fields = validate_quasi_and_sensitive_attributes(
                quasi_identifiers=quasi_identifiers,
                sensitive_attributes=sensitive_attributes,
                real_columns=real_columns,
                synthetic_columns=synthetic_columns,
            )
        except HTTPException as exc:
            fail_job(job_id, str(exc.detail))
            _cleanup(real_path, synthetic_path)
            return

        # ── 40%: read full dataframes into memory ─────────────────────────────
        update_job(job_id, "reading", 40, "Reading datasets into memory...")
        logger.info("[JOB %s] Loading dataframes", job_id)

        real_df = pd.read_excel(real_path) if real_ext == ".xlsx" else pd.read_csv(real_path)
        synthetic_df = (
            pd.read_excel(synthetic_path) if synthetic_ext == ".xlsx" else pd.read_csv(synthetic_path)
        )

        # ── 55%: persist dataset metadata to the database ────────────────────
        update_job(job_id, "processing", 55, "Storing dataset metadata...")
        logger.info("[JOB %s] Saving dataset records to database", job_id)

        async with AsyncSessionLocal() as db:
            system_user_id = await get_or_create_user(
                db=db,
                email="system@privacyassessment.local",
                name="System",
                role="system",
            )

            real_dataset_id = await insert_dataset(
                db=db,
                user_id=system_user_id,
                dataset_name=f"Real Dataset - {real_original_filename}",
                dataset_type="real",
                input_filename=real_original_filename,
                stored_filename=real_stored_filename,
                file_path=str(real_path),
                file_extension=real_ext,
                file_size_bytes=real_size,
                mime_type=real_content_type,
                row_count=len(real_df),
                column_count=len(real_df.columns),
                status="uploaded",
            )
            await insert_attributes(
                db=db,
                dataset_id=real_dataset_id,
                attributes=[
                    {
                        "name": col,
                        "is_qi": col in validated_fields["quasi_identifiers"],
                        "is_sa": col in validated_fields["sensitive_attributes"],
                        "data_type": str(real_df[col].dtype),
                    }
                    for col in real_df.columns
                ],
            )

            synthetic_dataset_id = await insert_dataset(
                db=db,
                user_id=system_user_id,
                dataset_name=f"Synthetic Dataset - {synthetic_original_filename}",
                dataset_type="synthetic",
                input_filename=synthetic_original_filename,
                stored_filename=synthetic_stored_filename,
                file_path=str(synthetic_path),
                file_extension=synthetic_ext,
                file_size_bytes=synthetic_size,
                mime_type=synthetic_content_type,
                row_count=len(synthetic_df),
                column_count=len(synthetic_df.columns),
                status="uploaded",
            )
            await insert_attributes(
                db=db,
                dataset_id=synthetic_dataset_id,
                attributes=[
                    {
                        "name": col,
                        "is_qi": col in validated_fields["quasi_identifiers"],
                        "is_sa": col in validated_fields["sensitive_attributes"],
                        "data_type": str(synthetic_df[col].dtype),
                    }
                    for col in synthetic_df.columns
                ],
            )

            # ── 70%: run all three privacy risk evaluations ───────────────────
            update_job(job_id, "evaluating", 70, "Running privacy risk evaluation...")
            logger.info("[JOB %s] Starting risk evaluation", job_id)

            evaluation_result = await risk_evaluation(
                real_uuid=real_dataset_id,
                synthetic_uuid=synthetic_dataset_id,
                qi_list=validated_fields["quasi_identifiers"],
                sa_list=validated_fields["sensitive_attributes"],
                real_path=str(real_path),
                synthetic_path=str(synthetic_path),
            )

            # ── 85%: persist risk results to the database ─────────────────────
            update_job(job_id, "reporting", 85, "Saving evaluation results...")
            logger.info("[JOB %s] Persisting risk results", job_id)

            await seed_risk_types(db=db)
            evaluation_id = await create_risk_evaluation(
                db=db,
                user_id=system_user_id,
                real_dataset_id=real_dataset_id,
                synthetic_dataset_id=synthetic_dataset_id,
                selected_qis=validated_fields["quasi_identifiers"],
                selected_sas=validated_fields["sensitive_attributes"],
                status="processing",
            )

            summary = evaluation_result.get("summary", {})
            risk_scores: list[float] = []

            uniqueness_result = summary.get("uniqueness_and_rare_combination", {})
            if uniqueness_result:
                u_score = uniqueness_result.get("uniqueness_score_pct", 0)
                u_level = "HIGH" if u_score >= 20 else "MEDIUM" if u_score >= 10 else "LOW"
                await create_risk_result(
                    db=db,
                    evaluation_id=evaluation_id,
                    risk_type_id=UNIQUENESS_RISK,
                    risk_score=u_score,
                    risk_level=u_level,
                    risk_summary=f"Uniqueness risk score: {u_score}%",
                    result_json=uniqueness_result,
                )
                risk_scores.append(u_score)

                r_score = uniqueness_result.get("rare_combination_score_pct", 0)
                r_level = "HIGH" if r_score >= 20 else "MEDIUM" if r_score >= 10 else "LOW"
                await create_risk_result(
                    db=db,
                    evaluation_id=evaluation_id,
                    risk_type_id=RARE_COMBINATION_RISK,
                    risk_score=r_score,
                    risk_level=r_level,
                    risk_summary=f"Rare combination risk score: {r_score}%",
                    result_json=uniqueness_result,
                )
                risk_scores.append(r_score)

            linkage_result = summary.get("linkage_reidentification", {})
            if linkage_result:
                l_score = linkage_result.get("overall_linkage_score_pct", 0)
                l_level = linkage_result.get("risk_level", "LOW")
                await create_risk_result(
                    db=db,
                    evaluation_id=evaluation_id,
                    risk_type_id=LINKAGE_REIDENTIFICATION_RISK,
                    risk_score=l_score,
                    risk_level=l_level,
                    risk_summary=linkage_result.get("risk_summary", f"Linkage risk score: {l_score}%"),
                    result_json=linkage_result,
                )
                risk_scores.append(l_score)

            attr_result = summary.get("attribute_inference_summary", {})
            if attr_result:
                a_scores: list[float] = []
                for _sa, sa_rows in attr_result.items():
                    if isinstance(sa_rows, list):
                        for row in sa_rows:
                            if isinstance(row, dict) and "risk_score" in row:
                                s = row["risk_score"]
                                a_scores.append(s * 100 if s <= 1.0 else s)
                a_avg = sum(a_scores) / len(a_scores) if a_scores else 0
                a_level = "HIGH" if a_avg >= 20 else "MEDIUM" if a_avg >= 10 else "LOW"
                await create_risk_result(
                    db=db,
                    evaluation_id=evaluation_id,
                    risk_type_id=ATTRIBUTE_INFERENCE_RISK,
                    risk_score=a_avg,
                    risk_level=a_level,
                    risk_summary="Attribute inference risk evaluated for selected sensitive attributes.",
                    result_json=attr_result,
                )
                risk_scores.append(a_avg)

            if risk_scores:
                overall = max(risk_scores)
                ov_level = "HIGH" if overall >= 20 else "MEDIUM" if overall >= 10 else "LOW"
                await update_risk_evaluation_overall_score(
                    db=db,
                    evaluation_id=evaluation_id,
                    overall_score=overall,
                    overall_risk_level=ov_level,
                    status="completed",
                )

        # ── 95%: build final response payload ─────────────────────────────────
        update_job(job_id, "reporting", 95, "Preparing analysis report...")
        logger.info("[JOB %s] Building final result payload", job_id)

        common_columns = sorted(set(real_columns) & set(synthetic_columns))
        real_only_columns = sorted(set(real_columns) - set(synthetic_columns))
        synthetic_only_columns = sorted(set(synthetic_columns) - set(real_columns))

        result = {
            "message": (
                f"Uploaded {real_original_filename} and {synthetic_original_filename} successfully"
            ),
            "status": "stored",
            "evaluation_id": evaluation_id,
            "quasi_identifiers": validated_fields["quasi_identifiers"],
            "sensitive_attributes": validated_fields["sensitive_attributes"],
            "sensitive_attributes_missing": validated_fields.get("sensitive_attributes_missing", {}),
            "risk_evaluation": evaluation_result,
            "real_file": {
                "dataset_id": real_dataset_id,
                "file_name": real_original_filename,
                "original_filename": real_original_filename,
                "stored_filename": real_stored_filename,
                "path": str(real_path),
                "size_bytes": real_size,
                "extension": real_ext,
                "row_count": len(real_df),
                "column_count": len(real_df.columns),
                "columns": real_columns,
            },
            "synthetic_file": {
                "dataset_id": synthetic_dataset_id,
                "file_name": synthetic_original_filename,
                "original_filename": synthetic_original_filename,
                "stored_filename": synthetic_stored_filename,
                "path": str(synthetic_path),
                "size_bytes": synthetic_size,
                "extension": synthetic_ext,
                "row_count": len(synthetic_df),
                "column_count": len(synthetic_df.columns),
                "columns": synthetic_columns,
            },
            "common_columns": common_columns,
            "real_only_columns": real_only_columns,
            "synthetic_only_columns": synthetic_only_columns,
        }

        # ── 100%: done ────────────────────────────────────────────────────────
        complete_job(job_id, result)
        logger.info("[JOB %s] Completed successfully", job_id)

    except Exception as exc:
        logger.exception("[JOB %s] Unexpected error: %s", job_id, str(exc))
        _cleanup(real_path, synthetic_path)
        fail_job(job_id, f"Unexpected error: {str(exc)}")


def _cleanup(real_path: Path, synthetic_path: Path) -> None:
    """Remove uploaded files if they still exist (called on failure)."""
    for p in (real_path, synthetic_path):
        try:
            if p and p.exists():
                p.unlink()
        except Exception:
            pass


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_datasets(
    background_tasks: BackgroundTasks,
    real_file: UploadFile = File(...),
    synthetic_file: UploadFile = File(...),
    quasi_identifiers: list[str] = Form(...),
    sensitive_attributes: list[str] = Form(...),
):
    """
    Accept uploaded datasets and return a job_id immediately.
    The full evaluation runs as a background task.
    Poll GET /api/progress/{job_id} for live status updates.
    """
    logger.info("[UPLOAD_START] Received upload request")
    logger.info(
        "[UPLOAD_INPUT] Real file: %s, Synthetic file: %s",
        real_file.filename,
        synthetic_file.filename,
    )
    logger.info(
        "[UPLOAD_INPUT] Quasi identifiers: %s, Sensitive attributes: %s",
        quasi_identifiers,
        sensitive_attributes,
    )

    if not real_file:
        raise HTTPException(status_code=400, detail="Real dataset file is required")
    if not synthetic_file:
        raise HTTPException(status_code=400, detail="Synthetic dataset file is required")
    if not quasi_identifiers:
        raise HTTPException(status_code=400, detail="At least one quasi identifier is required")
    if not sensitive_attributes:
        raise HTTPException(status_code=400, detail="At least one sensitive attribute is required")

    # Save files immediately — UploadFile is no longer readable after the
    # request handler returns, so we must persist to disk before launching
    # the background task.
    try:
        real_stored_filename, real_path, real_size, real_ext = await save_upload_file(
            upload_file=real_file,
            storage_dir=REAL_STORAGE_DIR,
        )
        synthetic_stored_filename, synthetic_path, synthetic_size, synthetic_ext = await save_upload_file(
            upload_file=synthetic_file,
            storage_dir=SYNTHETIC_STORAGE_DIR,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded files: {str(exc)}")

    # Create job and hand off to background processing
    job_id = create_job()
    update_job(job_id, "uploading", 10, "Files received, starting analysis...")
    logger.info("[UPLOAD] Created job %s", job_id)

    background_tasks.add_task(
        run_evaluation_job,
        job_id=job_id,
        real_original_filename=real_file.filename,
        real_content_type=real_file.content_type,
        real_stored_filename=real_stored_filename,
        real_path=real_path,
        real_size=real_size,
        real_ext=real_ext,
        synthetic_original_filename=synthetic_file.filename,
        synthetic_content_type=synthetic_file.content_type,
        synthetic_stored_filename=synthetic_stored_filename,
        synthetic_path=synthetic_path,
        synthetic_size=synthetic_size,
        synthetic_ext=synthetic_ext,
        quasi_identifiers=quasi_identifiers,
        sensitive_attributes=sensitive_attributes,
    )

    return {
        "job_id": job_id,
        "status": "started",
        "message": "Analysis started",
    }


@router.get("/progress/{job_id}")
async def get_progress(job_id: str):
    """
    Return the current progress of a background evaluation job.

    Response shape:
      {
        "job_id":   str,
        "status":   "queued"|"uploading"|"validating"|"reading"|"processing"|
                    "evaluating"|"reporting"|"completed"|"failed",
        "progress": 0..100,
        "message":  str,
        "result":   <full result object when completed, else null>,
        "error":    <error string when failed, else null>
      }
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    job = jobs[job_id]
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress": job["progress"],
        "message": job["message"],
        "result": job["result"] if job["status"] == "completed" else None,
        "error": job["error"] if job["status"] == "failed" else None,
    }
