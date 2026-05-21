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

from app.services.risk_evaluation import risk_evaluation
from app.database import get_async_db
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

        logger.info("Validating quasi-identifiers and sensitive attributes (using submitted values)...")

        # Use the QIs and SAs submitted by the frontend so user selections
        # are honoured. Falls back gracefully via validate_quasi_and_sensitive_attributes
        # which filters out any attributes missing from the uploaded files.
        validated_fields = validate_quasi_and_sensitive_attributes(
            quasi_identifiers=quasi_identifiers,
            sensitive_attributes=sensitive_attributes,
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

        logger.info("Getting or creating system user for dataset storage...")
        
        # Create/get a default system user for storing datasets
        system_user_id = await get_or_create_user(
            db=db,
            email="system@privacyassessment.local",
            name="System",
            role="system"
        )
        
        logger.info(f"System user ID: {system_user_id}")

        logger.info("Saving real dataset metadata to datasets table...")
        
        real_dataset_id = await insert_dataset(
            db=db,
            user_id=system_user_id,
            dataset_name=f"Real Dataset - {real_file.filename}",
            dataset_type="real",
            input_filename=real_file.filename,
            stored_filename=real_stored_filename,
            file_path=str(real_path),
            file_extension=real_ext,
            file_size_bytes=real_size,
            mime_type=real_file.content_type,
            row_count=len(real_df),
            column_count=len(real_df.columns),
            status="uploaded"
        )
        
        logger.info(f"Real dataset record inserted with ID: {real_dataset_id}")

        logger.info("Saving real dataset attributes...")
        
        # Infer data types from dataframe
        real_attributes = []
        for col in real_df.columns:
            real_attributes.append({
                "name": col,
                "is_qi": col in validated_fields["quasi_identifiers"],
                "is_sa": col in validated_fields["sensitive_attributes"],
                "data_type": str(real_df[col].dtype)
            })
        
        await insert_attributes(db=db, dataset_id=real_dataset_id, attributes=real_attributes)
        
        logger.info(f"Real dataset attributes inserted: {len(real_attributes)} attributes")

        logger.info("Saving synthetic dataset metadata to datasets table...")
        
        synthetic_dataset_id = await insert_dataset(
            db=db,
            user_id=system_user_id,
            dataset_name=f"Synthetic Dataset - {synthetic_file.filename}",
            dataset_type="synthetic",
            input_filename=synthetic_file.filename,
            stored_filename=synthetic_stored_filename,
            file_path=str(synthetic_path),
            file_extension=synthetic_ext,
            file_size_bytes=synthetic_size,
            mime_type=synthetic_file.content_type,
            row_count=len(synthetic_df),
            column_count=len(synthetic_df.columns),
            status="uploaded"
        )
        
        logger.info(f"Synthetic dataset record inserted with ID: {synthetic_dataset_id}")

        logger.info("Saving synthetic dataset attributes...")
        
        # Infer data types from dataframe
        synthetic_attributes = []
        for col in synthetic_df.columns:
            synthetic_attributes.append({
                "name": col,
                "is_qi": col in validated_fields["quasi_identifiers"],
                "is_sa": col in validated_fields["sensitive_attributes"],
                "data_type": str(synthetic_df[col].dtype)
            })
        
        await insert_attributes(db=db, dataset_id=synthetic_dataset_id, attributes=synthetic_attributes)
        
        logger.info(f"Synthetic dataset attributes inserted: {len(synthetic_attributes)} attributes")

        logger.info("Starting risk evaluation...")

        evaluation_result = await risk_evaluation(
            real_uuid=real_dataset_id,
            synthetic_uuid=synthetic_dataset_id,
            qi_list=validated_fields["quasi_identifiers"],
            sa_list=validated_fields["sensitive_attributes"],
            real_path=str(real_path),
            synthetic_path=str(synthetic_path),
        )

        logger.info(
            f"Risk evaluation completed for datasets: "
            f"{real_dataset_id} vs {synthetic_dataset_id}"
        )

        logger.info("Seeding risk types table...")
        
        await seed_risk_types(db=db)
        
        logger.info("Saving risk evaluation results to database...")

        # Create risk evaluation record
        evaluation_id = await create_risk_evaluation(
            db=db,
            user_id=system_user_id,
            real_dataset_id=real_dataset_id,
            synthetic_dataset_id=synthetic_dataset_id,
            selected_qis=validated_fields["quasi_identifiers"],
            selected_sas=validated_fields["sensitive_attributes"],
            status="processing"
        )

        logger.info(f"Risk evaluation record created with ID: {evaluation_id}")

        # Parse and save risk results
        summary = evaluation_result.get("summary", {})
        risk_scores = []

        # 1. Process uniqueness_and_rare_combination results
        uniqueness_result = summary.get("uniqueness_and_rare_combination", {})
        if uniqueness_result:
            # Uniqueness Risk
            uniqueness_score = uniqueness_result.get("uniqueness_score_pct", 0)
            uniqueness_level = "HIGH" if uniqueness_score >= 20 else "MEDIUM" if uniqueness_score >= 10 else "LOW"
            
            await create_risk_result(
                db=db,
                evaluation_id=evaluation_id,
                risk_type_id=UNIQUENESS_RISK,
                risk_score=uniqueness_score,
                risk_level=uniqueness_level,
                risk_summary=f"Uniqueness risk score: {uniqueness_score}%",
                result_json=uniqueness_result
            )
            risk_scores.append(uniqueness_score)

            # Rare Combination Risk
            rare_combo_score = uniqueness_result.get("rare_combination_score_pct", 0)
            rare_combo_level = "HIGH" if rare_combo_score >= 20 else "MEDIUM" if rare_combo_score >= 10 else "LOW"
            
            await create_risk_result(
                db=db,
                evaluation_id=evaluation_id,
                risk_type_id=RARE_COMBINATION_RISK,
                risk_score=rare_combo_score,
                risk_level=rare_combo_level,
                risk_summary=f"Rare combination risk score: {rare_combo_score}%",
                result_json=uniqueness_result
            )
            risk_scores.append(rare_combo_score)

        # 2. Process linkage_reidentification results
        linkage_result = summary.get("linkage_reidentification", {})
        if linkage_result:
            linkage_score = linkage_result.get("overall_linkage_score_pct", 0)
            linkage_level = linkage_result.get("risk_level", "LOW")
            
            await create_risk_result(
                db=db,
                evaluation_id=evaluation_id,
                risk_type_id=LINKAGE_REIDENTIFICATION_RISK,
                risk_score=linkage_score,
                risk_level=linkage_level,
                risk_summary=linkage_result.get("risk_summary", f"Linkage risk score: {linkage_score}%"),
                result_json=linkage_result
            )
            risk_scores.append(linkage_score)

        # 3. Process attribute_inference_summary results
        attr_inference_result = summary.get("attribute_inference_summary", {})
        if attr_inference_result:
            # Calculate average risk score across all sensitive attributes
            attr_risk_scores = []
            for sa, sa_results in attr_inference_result.items():
                if isinstance(sa_results, list):
                    for result in sa_results:
                        if isinstance(result, dict) and "risk_score" in result:
                            score = result["risk_score"]
                            # Convert to percentage if it's a decimal
                            if score <= 1.0:
                                score *= 100
                            attr_risk_scores.append(score)
            
            attr_avg_score = sum(attr_risk_scores) / len(attr_risk_scores) if attr_risk_scores else 0
            attr_level = "HIGH" if attr_avg_score >= 20 else "MEDIUM" if attr_avg_score >= 10 else "LOW"
            
            await create_risk_result(
                db=db,
                evaluation_id=evaluation_id,
                risk_type_id=ATTRIBUTE_INFERENCE_RISK,
                risk_score=attr_avg_score,
                risk_level=attr_level,
                risk_summary="Attribute inference risk evaluated for selected sensitive attributes.",
                result_json=attr_inference_result
            )
            risk_scores.append(attr_avg_score)

        # 4. Calculate and update overall evaluation score
        if risk_scores:
            overall_score = max(risk_scores)  # Use maximum score as specified
            overall_risk_level = "HIGH" if overall_score >= 20 else "MEDIUM" if overall_score >= 10 else "LOW"
            
            await update_risk_evaluation_overall_score(
                db=db,
                evaluation_id=evaluation_id,
                overall_score=overall_score,
                overall_risk_level=overall_risk_level,
                status="completed"
            )
            logger.info(f"Updated evaluation with overall score: {overall_score} ({overall_risk_level})")

        logger.info("Risk evaluation results saved to database successfully")

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
            "evaluation_id": evaluation_id,
            "quasi_identifiers": validated_fields["quasi_identifiers"],
            "sensitive_attributes": validated_fields["sensitive_attributes"],
            "sensitive_attributes_missing": validated_fields.get("sensitive_attributes_missing", {}),
            "risk_evaluation": evaluation_result,
            "real_file": {
                "dataset_id": real_dataset_id,
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
                "dataset_id": synthetic_dataset_id,
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