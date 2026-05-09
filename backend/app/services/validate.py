from fastapi import UploadFile, HTTPException
from pathlib import Path
import uuid
import pandas as pd

ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def validate_file_extension(filename: str) -> str:
    if not filename:
        raise HTTPException(status_code=400, detail="File name is missing")

    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed: {ext}. Allowed types are .csv and .xlsx"
        )

    return ext


async def save_upload_file(upload_file: UploadFile, storage_dir: Path) -> tuple[str, Path, int, str]:
    ext = validate_file_extension(upload_file.filename)

    stored_filename = f"{uuid.uuid4()}{ext}"
    save_path = storage_dir / stored_filename
    total_size = 0

    try:
        with open(save_path, "wb") as buffer:
            while True:
                chunk = await upload_file.read(1024 * 1024)
                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    buffer.close()
                    if save_path.exists():
                        save_path.unlink()
                    raise HTTPException(
                        status_code=400,
                        detail="File too large. Max size is 20 MB"
                    )

                buffer.write(chunk)

    except HTTPException:
        raise
    except Exception as e:
        if save_path.exists():
            save_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    finally:
        await upload_file.close()

    return stored_filename, save_path, total_size, ext


def extract_columns(file_path: Path) -> list[str]:
    ext = file_path.suffix.lower()

    try:
        if ext == ".csv":
            df = pd.read_csv(file_path, nrows=0)
        elif ext == ".xlsx":
            df = pd.read_excel(file_path, nrows=0)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")

        columns = [str(col).strip() for col in df.columns.tolist()]

        if not columns:
            raise HTTPException(
                status_code=400,
                detail=f"No columns found in file: {file_path.name}"
            )

        return columns

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse file '{file_path.name}': {str(e)}"
        )


def _clean_field_list(fields: list[str], field_name: str) -> list[str]:
    cleaned = [field.strip() for field in fields if field and field.strip()]

    if not cleaned:
        raise HTTPException(status_code=400, detail=f"At least one {field_name} is required")

    return list(dict.fromkeys(cleaned))


def _validate_fields_exist(fields: list[str], columns: list[str], dataset_name: str, field_type: str) -> None:
    missing = [field for field in fields if field not in columns]

    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"{field_type} missing in {dataset_name} dataset: {missing}"
        )


def validate_quasi_and_sensitive_attributes(
    quasi_identifiers: list[str],
    sensitive_attributes: list[str],
    real_columns: list[str],
    synthetic_columns: list[str]
) -> dict:
    cleaned_qis = _clean_field_list(quasi_identifiers, "quasi identifier")
    cleaned_sas = _clean_field_list(sensitive_attributes, "sensitive attribute")

    overlapping_fields = sorted(list(set(cleaned_qis).intersection(set(cleaned_sas))))
    if overlapping_fields:
        raise HTTPException(
            status_code=400,
            detail=f"These fields cannot be in both quasi identifiers and sensitive attributes: {overlapping_fields}"
        )

    _validate_fields_exist(cleaned_qis, real_columns, "real", "Quasi identifiers")
    _validate_fields_exist(cleaned_qis, synthetic_columns, "synthetic", "Quasi identifiers")

    # For sensitive attributes, be more lenient: return only those
    # present in both datasets and report which are missing where. This
    # allows callers to proceed with valid attributes while informing the
    # user about missing ones.
    missing_in_real = [sa for sa in cleaned_sas if sa not in real_columns]
    missing_in_synthetic = [sa for sa in cleaned_sas if sa not in synthetic_columns]

    valid_sas = [
        sa
        for sa in cleaned_sas
        if sa in real_columns and sa in synthetic_columns
    ]

    if not valid_sas:
        # No valid sensitive attributes that exist in both datasets —
        # this is a terminal validation error for the upload flow.
        raise HTTPException(
            status_code=400,
            detail=(
                "No sensitive attributes were found in both datasets. "
                f"Missing in real: {missing_in_real}, missing in synthetic: {missing_in_synthetic}"
            ),
        )

    return {
        "quasi_identifiers": cleaned_qis,
        "sensitive_attributes": valid_sas,
        "sensitive_attributes_missing": {
            "missing_in_real": missing_in_real,
            "missing_in_synthetic": missing_in_synthetic,
        },
    }