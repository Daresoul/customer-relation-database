-- Migration: Add city and postal_code to households
-- Purpose: Add location fields for household detail view

ALTER TABLE households ADD COLUMN city TEXT;
ALTER TABLE households ADD COLUMN postal_code TEXT;

-- Index for city searches
CREATE INDEX IF NOT EXISTS idx_households_city ON households(city);
CREATE INDEX IF NOT EXISTS idx_households_postal ON households(postal_code);