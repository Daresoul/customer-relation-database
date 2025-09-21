-- Add missing fields to patients table
ALTER TABLE patients ADD COLUMN gender TEXT CHECK(gender IS NULL OR gender IN ('Male', 'Female', 'Unknown'));
ALTER TABLE patients ADD COLUMN color TEXT CHECK(color IS NULL OR length(color) <= 50);
ALTER TABLE patients ADD COLUMN microchip_id TEXT CHECK(microchip_id IS NULL OR length(microchip_id) <= 20);
ALTER TABLE patients ADD COLUMN is_active BOOLEAN DEFAULT 1;

-- Update the updated_at timestamp for existing records
UPDATE patients SET updated_at = CURRENT_TIMESTAMP;