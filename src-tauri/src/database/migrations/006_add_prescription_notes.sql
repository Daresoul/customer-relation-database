-- Migration 006: Add prescription_notes column to medical_records
-- Adds support for pharmacy/prescription notes that will be included in generated PDF reports

ALTER TABLE medical_records ADD COLUMN prescription_notes TEXT;
