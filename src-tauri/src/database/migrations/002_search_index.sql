-- FTS5 Search Index for fast patient and owner searching

-- Create view for search content
CREATE VIEW IF NOT EXISTS patients_owners_view AS
SELECT
    p.id as patient_id,
    p.name as patient_name,
    p.species,
    p.breed,
    o.first_name as owner_first_name,
    o.last_name as owner_last_name
FROM patients p
LEFT JOIN patient_owners po ON p.id = po.patient_id
LEFT JOIN owners o ON po.owner_id = o.id;

-- Create FTS5 virtual table for search
CREATE VIRTUAL TABLE IF NOT EXISTS patient_search USING fts5(
    patient_name,
    species,
    breed,
    owner_first_name,
    owner_last_name,
    content='patients_owners_view',
    content_rowid='patient_id'
);