from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pathlib import Path
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.services.validate import (
    save_upload_file,
    extract_columns,
    validate_quasi_and_sensitive_attributes,
)
from app.validation import DEFAULT_QIS, DEFAULT_SAS
from app.services.risk_evaluation import risk_evaluation
from app.database import get_async_db
from app.repositories import insert_dataset_upload
from app.models import DatasetKind

logger = logging.getLogger(__name__)

router = APIRouter()

REAL_STORAGE_DIR = Path("storage/real")
SYNTHETIC_STORAGE_DIR = Path("storage/synthetic")

REAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
SYNTHETIC_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_datasets(
    real_file: UploadFile = File(...),
    synthetic_file: UploadFile = File(...),
    quasi_identifiers: list[str] = Form(...),
    sensitive_attributes: list[str] = Form(...),
    db: AsyncSession = Depends(get_async_db),
):
    logger.info("[UPLOAD_START] Received upload request")
    logger.info(
        f"[UPLOAD_INPUT] Real file: {real_file.filename}, "
        f"Synthetic file: {synthetic_file.filename}"
    )
    logger.info(
        f"[UPLOAD_INPUT] Quasi identifiers: {quasi_identifiers}, "
        f"Sensitive attributes: {sensitive_attributes}"
    )

    if not real_file:
        logger.error("[UPLOAD_ERROR] Real dataset file is required")
        raise HTTPException(status_code=400, detail="Real dataset file is required")

    if not synthetic_file:
        logger.error("[UPLOAD_ERROR] Synthetic dataset file is required")
        raise HTTPException(status_code=400, detail="Synthetic dataset file is required")

    if not quasi_identifiers:
        logger.error("[UPLOAD_ERROR] At least one quasi identifier is required")
        raise HTTPException(status_code=400, detail="At least one quasi identifier is required")

    if not sensitive_attributes:
        logger.error("[UPLOAD_ERROR] At least one sensitive attribute is required")
        raise HTTPException(status_code=400, detail="At least one sensitive attribute is required")

    real_path = None
    synthetic_path = None

    try:
        logger.info("Starting file save process...")

        real_stored_filename, real_path, real_size, real_ext = await save_upload_file(
            upload_file=real_file,
            storage_dir=REAL_STORAGE_DIR,
        )
        logger.info(
            f"Real file saved: {real_stored_filename}, "
            f"Size: {real_size} bytes, Type: {real_ext}"
        )

        synthetic_stored_filename, synthetic_path, synthetic_size, synthetic_ext = await save_upload_file(
            upload_file=synthetic_file,
            storage_dir=SYNTHETIC_STORAGE_DIR,
        )
        logger.info(
            f"Synthetic file saved: {synthetic_stored_filename}, "
            f"Size: {synthetic_size} bytes, Type: {synthetic_ext}"
        )

        logger.info("Extracting columns from files...")

        real_columns = extract_columns(real_path)
        logger.info(
            f"Real file columns: "
            f"{len(real_columns)} columns - {real_columns[:5]}..."
        )

        synthetic_columns = extract_columns(synthetic_path)
        logger.info(
            f"Synthetic file columns: "
            f"{len(synthetic_columns)} columns - {synthetic_columns[:5]}..."
        )

        logger.info("Validating quasi-identifiers and sensitive attributes (using server defaults)...")

        # Use server-side defaults for QIs and SAs to ensure consistent
        # evaluation regardless of frontend input. This also simplifies
        # testing and ensures both uniqueness and attribute-inference use
        # the same columns.
        validated_fields = validate_quasi_and_sensitive_attributes(
            quasi_identifiers=DEFAULT_QIS,
            sensitive_attributes=DEFAULT_SAS,
            real_columns=real_columns,
            synthetic_columns=synthetic_columns,
        )

        logger.info(
            f"Validation complete. Using QI: {validated_fields['quasi_identifiers']}, "
            f"SA: {validated_fields['sensitive_attributes']}"
        )

        logger.info("Reading dataframes into memory...")

        if real_ext == ".csv":
            real_df = pd.read_csv(real_path)
        else:
            real_df = pd.read_excel(real_path)

        logger.info(
            f"Real dataframe loaded: "
            f"{real_df.shape[0]} rows, {real_df.shape[1]} columns"
        )

        if synthetic_ext == ".csv":
            synthetic_df = pd.read_csv(synthetic_path)
        else:
            synthetic_df = pd.read_excel(synthetic_path)

        logger.info(
            f"Synthetic dataframe loaded: "
            f"{synthetic_df.shape[0]} rows, {synthetic_df.shape[1]} columns"
        )

        logger.info("Inserting real dataset metadata into database...")

        real_file_uuid = await insert_dataset_upload(
            db=db,
            dataset_kind=DatasetKind.real,
            input_filename=real_file.filename,
            stored_filename=real_stored_filename,
            file_path=str(real_path),
            file_extension=real_ext,
            file_size_bytes=real_size,
            mime_type=real_file.content_type,
            row_count=len(real_df),
            column_count=len(real_df.columns),
            status="uploaded",
            notes=None,
        )

        logger.info(f"Real dataset metadata inserted with UUID: {real_file_uuid}")

        logger.info("Inserting synthetic dataset metadata into database...")

        synthetic_file_uuid = await insert_dataset_upload(
            db=db,
            dataset_kind=DatasetKind.synthetic,
            input_filename=synthetic_file.filename,
            stored_filename=synthetic_stored_filename,
            file_path=str(synthetic_path),
            file_extension=synthetic_ext,
            file_size_bytes=synthetic_size,
            mime_type=synthetic_file.content_type,
            row_count=len(synthetic_df),
            column_count=len(synthetic_df.columns),
            status="uploaded",
            notes=None,
        )

        logger.info(f"Synthetic dataset metadata inserted with UUID: {synthetic_file_uuid}")

        logger.info("Starting risk evaluation...")

        evaluation_result = await risk_evaluation(
            real_uuid=str(real_file_uuid),
            synthetic_uuid=str(synthetic_file_uuid),
            qi_list=validated_fields["quasi_identifiers"],
            sa_list=validated_fields["sensitive_attributes"],
            real_path=str(real_path),
            synthetic_path=str(synthetic_path),
        )

        logger.info(
            f"Risk evaluation completed for datasets: "
            f"{real_file_uuid} vs {synthetic_file_uuid}"
        )

        logger.info("Preparing response data...")

        common_columns = sorted(list(set(real_columns).intersection(set(synthetic_columns))))
        real_only_columns = sorted(list(set(real_columns) - set(synthetic_columns)))
        synthetic_only_columns = sorted(list(set(synthetic_columns) - set(real_columns)))

        logger.info(
            f"Column analysis - Common: {len(common_columns)}, "
            f"Real-only: {len(real_only_columns)}, "
            f"Synthetic-only: {len(synthetic_only_columns)}"
        )

        logger.info("[UPLOAD_COMPLETE] Upload and processing completed successfully")

        return {
            "message": f"Uploaded {real_file.filename} and {synthetic_file.filename} successfully",
            "status": "stored",
            "quasi_identifiers": validated_fields["quasi_identifiers"],
            "sensitive_attributes": validated_fields["sensitive_attributes"],
            "sensitive_attributes_missing": validated_fields.get("sensitive_attributes_missing", {}),
            "risk_evaluation": evaluation_result,
            "real_file": {
                "file_uuid": str(real_file_uuid),
                "file_name": real_file.filename,
                "original_filename": real_file.filename,
                "stored_filename": real_stored_filename,
                "path": str(real_path),
                "size_bytes": real_size,
                "extension": real_ext,
                "row_count": len(real_df),
                "column_count": len(real_df.columns),
                "columns": real_columns,
            },
            "synthetic_file": {
                "file_uuid": str(synthetic_file_uuid),
                "file_name": synthetic_file.filename,
                "original_filename": synthetic_file.filename,
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

    except HTTPException as http_exc:
        logger.error(f"[UPLOAD_HTTP_ERROR] HTTP Exception: {http_exc.detail}")

        if real_path and real_path.exists():
            real_path.unlink()
            logger.info(f"[CLEANUP] Deleted real file: {real_path}")

        if synthetic_path and synthetic_path.exists():
            synthetic_path.unlink()
            logger.info(f"[CLEANUP] Deleted synthetic file: {synthetic_path}")

        raise

    except Exception as e:
        logger.error(
            f"[UPLOAD_EXCEPTION] Unexpected error: {type(e).__name__}: {str(e)}",
            exc_info=True,
        )

        if real_path and real_path.exists():
            real_path.unlink()
            logger.info(f"[CLEANUP] Deleted real file: {real_path}")

        if synthetic_path and synthetic_path.exists():
            synthetic_path.unlink()
            logger.info(f"[CLEANUP] Deleted synthetic file: {synthetic_path}")

        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")