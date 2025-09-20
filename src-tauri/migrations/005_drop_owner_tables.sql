-- Migration: Drop owner-related tables
-- Date: 2025-09-20
-- Description: Remove legacy owner tables in favor of household/people structure

-- Drop the patient_owners table first (has foreign key constraints)
DROP TABLE IF EXISTS patient_owners;

-- Drop the owners table
DROP TABLE IF EXISTS owners;

-- Note: The household/people structure replaces the owner functionality