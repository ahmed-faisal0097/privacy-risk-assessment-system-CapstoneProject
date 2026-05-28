from sqlalchemy.ext.asyncio import AsyncSession
from .models import Dataset, Attribute, User, RiskType, RiskEvaluation, RiskResult

# Fixed system-defined risk type IDs
UNIQUENESS_RISK = 1
RARE_COMBINATION_RISK = 2
LINKAGE_REIDENTIFICATION_RISK = 3
ATTRIBUTE_INFERENCE_RISK = 4

async def insert_dataset(
    db: AsyncSession,
    user_id: int | str,
    dataset_name: str,
    dataset_type: str,
    input_filename: str,
    stored_filename: str = None,
    file_path: str = None,
    file_extension: str = None,
    file_size_bytes: int = None,
    mime_type: str = None,
    row_count: int = None,
    column_count: int = None,
    status: str = "uploaded"
) -> int:
    """Insert a dataset record and return the dataset_id."""
    dataset = Dataset(
        user_id=int(user_id) if isinstance(user_id, str) else user_id,
        dataset_name=dataset_name,
        dataset_type=dataset_type,
        input_filename=input_filename,
        stored_filename=stored_filename,
        file_path=file_path,
        file_extension=file_extension,
        file_size_bytes=file_size_bytes,
        mime_type=mime_type,
        row_count=row_count,
        column_count=column_count,
        status=status
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return dataset.dataset_id

async def insert_attributes(
    db: AsyncSession,
    dataset_id: int | str,
    attributes: list[dict]
) -> None:
    """Insert multiple attribute records for a dataset."""
    for attr in attributes:
        attribute = Attribute(
            dataset_id=int(dataset_id) if isinstance(dataset_id, str) else dataset_id,
            attribute_name=attr.get("name"),
            is_qi=attr.get("is_qi", False),
            is_sa=attr.get("is_sa", False),
            data_type=attr.get("data_type", None)
        )
        db.add(attribute)
    await db.commit()

async def get_or_create_user(
    db: AsyncSession,
    email: str,
    name: str = None,
    role: str = "analyst"
) -> int:
    """Get existing user by email or create a new one. Returns user_id."""
    from sqlalchemy import select
    
    # Try to find existing user
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        return existing_user.user_id
    
    # Create new user
    new_user = User(
        name=name or email.split("@")[0],
        email=email,
        role=role
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user.user_id

async def seed_risk_types(db: AsyncSession) -> None:
    """Seed the risk_types table with fixed integer IDs if not already present."""
    risk_types_data = [
        (UNIQUENESS_RISK, "Uniqueness Risk"),
        (RARE_COMBINATION_RISK, "Rare Combination Risk"),
        (LINKAGE_REIDENTIFICATION_RISK, "Linkage / Re-identification Risk"),
        (ATTRIBUTE_INFERENCE_RISK, "Attribute Inference Risk"),
    ]
    
    from sqlalchemy import select
    for risk_type_id, risk_name in risk_types_data:
        stmt = select(RiskType).where(RiskType.risk_type_id == risk_type_id)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if not existing:
            risk_type = RiskType(risk_type_id=risk_type_id, risk_name=risk_name)
            db.add(risk_type)
    
    await db.commit()

async def create_risk_evaluation(
    db: AsyncSession,
    user_id: int | str,
    real_dataset_id: int | str,
    synthetic_dataset_id: int | str,
    selected_qis: list[str],
    selected_sas: list[str],
    status: str = "pending"
) -> int:
    """Create a risk evaluation record and return the evaluation_id."""
    evaluation = RiskEvaluation(
        user_id=int(user_id) if isinstance(user_id, str) else user_id,
        real_dataset_id=int(real_dataset_id) if isinstance(real_dataset_id, str) else real_dataset_id,
        synthetic_dataset_id=int(synthetic_dataset_id) if isinstance(synthetic_dataset_id, str) else synthetic_dataset_id,
        selected_qis=selected_qis,
        selected_sas=selected_sas,
        status=status
    )
    db.add(evaluation)
    await db.commit()
    await db.refresh(evaluation)
    return evaluation.evaluation_id

async def create_risk_result(
    db: AsyncSession,
    evaluation_id: int | str,
    risk_type_id: int,
    risk_score: float = None,
    risk_level: str = None,
    risk_summary: str = None,
    result_json: dict = None
) -> int:
    """Create a risk result record and return the result_id."""
    risk_result = RiskResult(
        evaluation_id=int(evaluation_id) if isinstance(evaluation_id, str) else evaluation_id,
        risk_type_id=int(risk_type_id),
        risk_score=risk_score,
        risk_level=risk_level,
        risk_summary=risk_summary,
        result_json=result_json
    )
    db.add(risk_result)
    await db.commit()
    await db.refresh(risk_result)
    return risk_result.result_id

async def update_risk_evaluation_overall_score(
    db: AsyncSession,
    evaluation_id: int | str,
    overall_score: float,
    overall_risk_level: str,
    status: str = "completed"
) -> None:
    """Update the overall score and risk level for a risk evaluation."""
    from sqlalchemy import update
    stmt = (
        update(RiskEvaluation)
        .where(RiskEvaluation.evaluation_id == (int(evaluation_id) if isinstance(evaluation_id, str) else evaluation_id))
        .values(
            overall_score=overall_score,
            overall_risk_level=overall_risk_level,
            status=status
        )
    )
    await db.execute(stmt)
    await db.commit()
