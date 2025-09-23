-- Create currencies table
CREATE TABLE IF NOT EXISTS currencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    symbol TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default currencies
INSERT INTO currencies (code, name, symbol) VALUES
    ('MKD', 'Macedonian Denar', 'ден'),
    ('USD', 'US Dollar', '$'),
    ('EUR', 'Euro', '€'),
    ('GBP', 'British Pound', '£');

-- Create medical_records table
CREATE TABLE IF NOT EXISTS medical_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    record_type TEXT NOT NULL CHECK(record_type IN ('procedure', 'note')),
    name TEXT NOT NULL, -- Holds procedure name for procedures, title for notes
    procedure_name TEXT, -- Deprecated, kept for backward compatibility
    description TEXT NOT NULL,
    price REAL,
    currency_id INTEGER,
    is_archived BOOLEAN DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    updated_by TEXT,
    -- FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE, -- Commented out until patients table exists
    FOREIGN KEY (currency_id) REFERENCES currencies(id)
);

-- Create medical_attachments table
CREATE TABLE IF NOT EXISTS medical_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medical_record_id INTEGER NOT NULL,
    file_id TEXT NOT NULL UNIQUE, -- UUID for file storage
    original_name TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    uploaded_by TEXT,
    FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
);

-- Create medical_record_history table for audit trail
CREATE TABLE IF NOT EXISTS medical_record_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medical_record_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    changed_fields TEXT, -- JSON array of field names
    old_values TEXT, -- JSON object of old values
    new_values TEXT, -- JSON object of new values
    changed_by TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX idx_medical_records_record_type ON medical_records(record_type);
CREATE INDEX idx_medical_records_is_archived ON medical_records(is_archived);
CREATE INDEX idx_medical_attachments_medical_record_id ON medical_attachments(medical_record_id);
CREATE INDEX idx_medical_record_history_medical_record_id ON medical_record_history(medical_record_id);

-- Create full-text search table for medical records
CREATE VIRTUAL TABLE medical_records_fts USING fts5(
    name,
    description,
    procedure_name,
    content=medical_records,
    content_rowid=id
);

-- Create triggers to keep FTS index updated
CREATE TRIGGER medical_records_fts_insert AFTER INSERT ON medical_records
BEGIN
    INSERT INTO medical_records_fts(rowid, name, description, procedure_name)
    VALUES (new.id, new.name, new.description, new.procedure_name);
END;

CREATE TRIGGER medical_records_fts_update AFTER UPDATE ON medical_records
BEGIN
    UPDATE medical_records_fts
    SET name = new.name,
        description = new.description,
        procedure_name = new.procedure_name
    WHERE rowid = new.id;
END;

CREATE TRIGGER medical_records_fts_delete AFTER DELETE ON medical_records
BEGIN
    DELETE FROM medical_records_fts WHERE rowid = old.id;
END;