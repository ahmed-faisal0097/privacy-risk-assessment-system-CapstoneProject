-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS risk_results CASCADE;
DROP TABLE IF EXISTS risk_evaluations CASCADE;
DROP TABLE IF EXISTS attributes CASCADE;
DROP TABLE IF EXISTS risk_types CASCADE;
DROP TABLE IF EXISTS datasets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name VARCHAR NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    role VARCHAR NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create datasets table
CREATE TABLE datasets (
    dataset_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    dataset_name VARCHAR NOT NULL,
    dataset_type VARCHAR NOT NULL CHECK (dataset_type IN ('real', 'synthetic')),
    input_filename VARCHAR NOT NULL,
    stored_filename VARCHAR,
    file_path VARCHAR,
    file_extension VARCHAR,
    file_size_bytes BIGINT,
    mime_type VARCHAR,
    upload_time TIMESTAMPTZ DEFAULT NOW(),
    row_count INTEGER,
    column_count INTEGER,
    status VARCHAR DEFAULT 'uploaded'
);

-- Create attributes table
CREATE TABLE attributes (
    attribute_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    dataset_id INTEGER NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
    attribute_name VARCHAR NOT NULL,
    is_qi BOOLEAN DEFAULT FALSE,
    is_sa BOOLEAN DEFAULT FALSE,
    data_type VARCHAR,
    UNIQUE (dataset_id, attribute_name)
);

-- Create risk_types table
CREATE TABLE risk_types (
    risk_type_id INTEGER PRIMARY KEY,
    risk_name VARCHAR(100) UNIQUE NOT NULL
);

-- Create risk_evaluations table
CREATE TABLE risk_evaluations (
    evaluation_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    real_dataset_id INTEGER REFERENCES datasets(dataset_id),
    synthetic_dataset_id INTEGER REFERENCES datasets(dataset_id),
    evaluated_time TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR DEFAULT 'pending',
    overall_score NUMERIC(8,4),
    overall_risk_level VARCHAR,
    selected_qis TEXT[],
    selected_sas TEXT[]
);

-- Create risk_results table
CREATE TABLE risk_results (
    result_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    evaluation_id INTEGER NOT NULL REFERENCES risk_evaluations(evaluation_id) ON DELETE CASCADE,
    risk_type_id INTEGER NOT NULL REFERENCES risk_types(risk_type_id),
    risk_score NUMERIC(8,4),
    risk_summary TEXT,
    risk_level VARCHAR,
    result_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (evaluation_id, risk_type_id)
);

-- Create reports table
CREATE TABLE reports (
    report_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    evaluation_id INTEGER NOT NULL REFERENCES risk_evaluations(evaluation_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    report_type VARCHAR NOT NULL,
    report_name VARCHAR NOT NULL,
    report_path VARCHAR,
    generated_time TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for foreign keys and common queries
CREATE INDEX idx_datasets_user_id ON datasets(user_id);
CREATE INDEX idx_attributes_dataset_id ON attributes(dataset_id);
CREATE INDEX idx_risk_evaluations_user_id ON risk_evaluations(user_id);
CREATE INDEX idx_risk_evaluations_real_dataset_id ON risk_evaluations(real_dataset_id);
CREATE INDEX idx_risk_evaluations_synthetic_dataset_id ON risk_evaluations(synthetic_dataset_id);
CREATE INDEX idx_risk_results_evaluation_id ON risk_results(evaluation_id);
CREATE INDEX idx_reports_evaluation_id ON reports(evaluation_id);

-- Seed initial risk types
INSERT INTO risk_types (risk_type_id, risk_name) VALUES
    (1, 'Uniqueness Risk'),
    (2, 'Rare Combination Risk'),
    (3, 'Linkage / Re-identification Risk'),
    (4, 'Attribute Inference Risk')
ON CONFLICT (risk_type_id) DO NOTHING;