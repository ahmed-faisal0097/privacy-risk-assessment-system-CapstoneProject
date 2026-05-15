from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, NUMERIC, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"
    
    user_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    role = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Dataset(Base):
    __tablename__ = "datasets"
    
    dataset_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    dataset_name = Column(String, nullable=False)
    dataset_type = Column(String, nullable=False)  # 'real' or 'synthetic'
    input_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    file_extension = Column(String, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    upload_time = Column(DateTime(timezone=True), server_default=func.now())
    row_count = Column(Integer, nullable=True)
    column_count = Column(Integer, nullable=True)
    status = Column(String, default="uploaded")

class Attribute(Base):
    __tablename__ = "attributes"
    
    attribute_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False)
    attribute_name = Column(String, nullable=False)
    is_qi = Column(Boolean, default=False)
    is_sa = Column(Boolean, default=False)
    data_type = Column(String, nullable=True)

class RiskType(Base):
    __tablename__ = "risk_types"
    
    risk_type_id = Column(Integer, primary_key=True)
    risk_name = Column(String(100), unique=True, nullable=False)

class RiskEvaluation(Base):
    __tablename__ = "risk_evaluations"
    
    evaluation_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    real_dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.dataset_id"), nullable=True)
    synthetic_dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.dataset_id"), nullable=True)
    evaluated_time = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="pending")
    overall_score = Column(NUMERIC(8, 4), nullable=True)
    overall_risk_level = Column(String, nullable=True)
    selected_qis = Column(ARRAY(String), nullable=True)
    selected_sas = Column(ARRAY(String), nullable=True)

class RiskResult(Base):
    __tablename__ = "risk_results"
    
    result_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    evaluation_id = Column(UUID(as_uuid=True), ForeignKey("risk_evaluations.evaluation_id", ondelete="CASCADE"), nullable=False)
    risk_type_id = Column(Integer, ForeignKey("risk_types.risk_type_id"), nullable=False)
    risk_score = Column(NUMERIC(8, 4), nullable=True)
    risk_summary = Column(Text, nullable=True)
    risk_level = Column(String, nullable=True)
    result_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Report(Base):
    __tablename__ = "reports"
    
    report_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    evaluation_id = Column(UUID(as_uuid=True), ForeignKey("risk_evaluations.evaluation_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    report_type = Column(String, nullable=False)
    report_name = Column(String, nullable=False)
    report_path = Column(String, nullable=True)
    generated_time = Column(DateTime(timezone=True), server_default=func.now())