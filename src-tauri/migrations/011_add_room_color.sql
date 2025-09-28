-- Migration: Add color field to rooms table
-- Date: 2025-01-26
-- Feature: Room color for calendar visualization

-- Add color column to rooms table
ALTER TABLE rooms ADD COLUMN color TEXT DEFAULT '#1890ff';

-- Update existing rooms with different default colors
UPDATE rooms SET color = '#1890ff' WHERE name = 'Exam Room 1';
UPDATE rooms SET color = '#52c41a' WHERE name = 'Exam Room 2';
UPDATE rooms SET color = '#fa8c16' WHERE name = 'Surgery Room';
UPDATE rooms SET color = '#722ed1' WHERE name = 'Dental Suite';
UPDATE rooms SET color = '#eb2f96' WHERE name = 'Grooming Station';