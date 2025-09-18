-- Migration: Create people table
-- Purpose: Store individual people within households

CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_people_household ON people(household_id);
CREATE INDEX IF NOT EXISTS idx_people_name ON people(last_name, first_name);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_people_timestamp
AFTER UPDATE ON people
BEGIN
    UPDATE people SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to ensure only one primary person per household
CREATE TRIGGER IF NOT EXISTS ensure_one_primary_person
BEFORE INSERT ON people
WHEN NEW.is_primary = 1
BEGIN
    UPDATE people SET is_primary = 0 WHERE household_id = NEW.household_id AND is_primary = 1;
END;

CREATE TRIGGER IF NOT EXISTS ensure_one_primary_person_update
BEFORE UPDATE ON people
WHEN NEW.is_primary = 1 AND OLD.is_primary = 0
BEGIN
    UPDATE people SET is_primary = 0 WHERE household_id = NEW.household_id AND is_primary = 1 AND id != NEW.id;
END;