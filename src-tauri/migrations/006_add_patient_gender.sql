-- Add gender column to patients table
ALTER TABLE patients
ADD COLUMN gender TEXT CHECK(gender IN ('Male', 'Female', 'Unknown') OR gender IS NULL);