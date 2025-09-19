-- Migration: Create patient_households table
-- Purpose: Link patients to households (many-to-many)

CREATE TABLE IF NOT EXISTS patient_households (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    household_id INTEGER NOT NULL,
    relationship_type TEXT DEFAULT 'primary_household',
    is_primary BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
    UNIQUE(patient_id, household_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_patient_households_patient ON patient_households(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_households_household ON patient_households(household_id);

-- Trigger to ensure only one primary household per patient
CREATE TRIGGER IF NOT EXISTS ensure_one_primary_household
BEFORE INSERT ON patient_households
WHEN NEW.is_primary = 1
BEGIN
    UPDATE patient_households
    SET is_primary = 0
    WHERE patient_id = NEW.patient_id
    AND is_primary = 1;
END;

CREATE TRIGGER IF NOT EXISTS ensure_one_primary_household_update
BEFORE UPDATE ON patient_households
WHEN NEW.is_primary = 1 AND OLD.is_primary = 0
BEGIN
    UPDATE patient_households
    SET is_primary = 0
    WHERE patient_id = NEW.patient_id
    AND is_primary = 1
    AND id != NEW.id;
END;