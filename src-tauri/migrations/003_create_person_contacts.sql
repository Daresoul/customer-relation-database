-- Migration: Create person_contacts table
-- Purpose: Store contact methods for each person

CREATE TABLE IF NOT EXISTS person_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    contact_type TEXT NOT NULL CHECK(contact_type IN ('phone', 'email', 'mobile', 'work_phone')),
    contact_value TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_person_contacts_person ON person_contacts(person_id);
CREATE INDEX IF NOT EXISTS idx_person_contacts_value ON person_contacts(contact_value);

-- Trigger to ensure only one primary contact per type per person
CREATE TRIGGER IF NOT EXISTS ensure_one_primary_contact_per_type
BEFORE INSERT ON person_contacts
WHEN NEW.is_primary = 1
BEGIN
    UPDATE person_contacts
    SET is_primary = 0
    WHERE person_id = NEW.person_id
    AND contact_type = NEW.contact_type
    AND is_primary = 1;
END;

CREATE TRIGGER IF NOT EXISTS ensure_one_primary_contact_per_type_update
BEFORE UPDATE ON person_contacts
WHEN NEW.is_primary = 1 AND OLD.is_primary = 0
BEGIN
    UPDATE person_contacts
    SET is_primary = 0
    WHERE person_id = NEW.person_id
    AND contact_type = NEW.contact_type
    AND is_primary = 1
    AND id != NEW.id;
END;