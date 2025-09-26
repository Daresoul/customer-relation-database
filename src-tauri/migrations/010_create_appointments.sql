-- Migration: Create appointments management tables
-- Date: 2025-01-25
-- Feature: Appointments with room scheduling and Google Calendar sync

-- Create rooms table for appointment locations
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    capacity INTEGER DEFAULT 1 CHECK (capacity >= 1),
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create appointments table with soft deletion
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    title TEXT NOT NULL CHECK (length(title) <= 200),
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    room_id INTEGER,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    created_by TEXT NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    CHECK (end_time > start_time),
    CHECK (datetime(start_time) >= datetime('2000-01-01')),
    CHECK (datetime(end_time) <= datetime('2100-12-31'))
);

-- Create Google Calendar settings table
CREATE TABLE IF NOT EXISTS google_calendar_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE DEFAULT 'default',
    access_token TEXT,
    refresh_token TEXT,
    calendar_id TEXT,
    sync_enabled BOOLEAN DEFAULT 0,
    last_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create appointment sync log table
CREATE TABLE IF NOT EXISTS appointment_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    external_id TEXT,
    sync_action TEXT NOT NULL CHECK (sync_action IN ('create', 'update', 'delete')),
    sync_status TEXT NOT NULL CHECK (sync_status IN ('success', 'failed', 'pending')),
    error_message TEXT,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

-- Create indexes for performance

-- Index for appointment queries by date
CREATE INDEX IF NOT EXISTS idx_appointments_start_time
    ON appointments(start_time)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_end_time
    ON appointments(end_time)
    WHERE deleted_at IS NULL;

-- Index for patient appointments
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id
    ON appointments(patient_id)
    WHERE deleted_at IS NULL;

-- Index for room scheduling
CREATE INDEX IF NOT EXISTS idx_appointments_room_id
    ON appointments(room_id)
    WHERE deleted_at IS NULL;

-- Composite index for conflict detection
CREATE INDEX IF NOT EXISTS idx_appointments_room_schedule
    ON appointments(room_id, start_time, end_time)
    WHERE deleted_at IS NULL AND status != 'cancelled';

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_appointments_status
    ON appointments(status)
    WHERE deleted_at IS NULL;

-- Index for sync log queries
CREATE INDEX IF NOT EXISTS idx_sync_log_appointment
    ON appointment_sync_log(appointment_id);

CREATE INDEX IF NOT EXISTS idx_sync_log_external
    ON appointment_sync_log(external_id);

CREATE INDEX IF NOT EXISTS idx_sync_log_status
    ON appointment_sync_log(sync_status);

-- Triggers for updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_appointments_timestamp
    AFTER UPDATE ON appointments
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE appointments
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_rooms_timestamp
    AFTER UPDATE ON rooms
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE rooms
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_google_calendar_settings_timestamp
    AFTER UPDATE ON google_calendar_settings
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE google_calendar_settings
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Insert default rooms (optional - can be commented out if not needed)
INSERT INTO rooms (name, description, capacity, is_active) VALUES
    ('Exam Room 1', 'General examination room', 1, 1),
    ('Exam Room 2', 'General examination room', 1, 1),
    ('Surgery Room', 'Surgical procedures', 1, 1),
    ('Dental Suite', 'Dental procedures', 1, 1),
    ('Grooming Station', 'Grooming and bathing', 2, 1);

-- Insert default Google Calendar settings for default user
INSERT INTO google_calendar_settings (user_id, sync_enabled)
VALUES ('default', 0);