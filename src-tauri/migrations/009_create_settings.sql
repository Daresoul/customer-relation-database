-- Migration: Create app_settings table for user preferences
-- Date: 2025-01-24

-- Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'mk')),
    currency_id INTEGER,
    theme TEXT DEFAULT 'light' CHECK(theme IN ('light', 'dark')),
    date_format TEXT DEFAULT 'MM/DD/YYYY',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (currency_id) REFERENCES currencies(id),
    UNIQUE(user_id)
);

-- Create index for fast user lookups (future multi-user support)
CREATE INDEX IF NOT EXISTS idx_app_settings_user_id ON app_settings(user_id);

-- Insert default settings with USD currency if available
INSERT INTO app_settings (user_id, language, currency_id)
SELECT 'default', 'en', id
FROM currencies
WHERE code = 'USD'
LIMIT 1
ON CONFLICT(user_id) DO NOTHING;

-- If USD not found, insert without default currency
INSERT INTO app_settings (user_id, language)
SELECT 'default', 'en'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE user_id = 'default');