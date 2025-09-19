-- Migration: Create households table
-- Purpose: Store household (family/couple) information

CREATE TABLE IF NOT EXISTS households (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_name TEXT,
    address TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for household name searches
CREATE INDEX IF NOT EXISTS idx_households_name ON households(household_name);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_households_timestamp
AFTER UPDATE ON households
BEGIN
    UPDATE households SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;