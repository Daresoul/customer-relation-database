-- Migration: Create update_preferences table for auto-update system
-- Version: 012
-- Date: 2025-01-25
-- Feature: Auto-Update System

CREATE TABLE IF NOT EXISTS update_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auto_check_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_check_timestamp INTEGER,
    last_notified_version TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Insert default preferences (singleton pattern - only one row allowed)
INSERT OR IGNORE INTO update_preferences (
    id,
    auto_check_enabled,
    created_at,
    updated_at
)
VALUES (
    1,
    TRUE,
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Index for efficient lookups (though only 1 row exists)
CREATE INDEX IF NOT EXISTS idx_update_preferences_auto_check
ON update_preferences(auto_check_enabled);
