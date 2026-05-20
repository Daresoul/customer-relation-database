-- Line Item Templates (Settings - Reusable Templates)
CREATE TABLE IF NOT EXISTS line_item_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    default_price REAL NOT NULL,
    currency_id INTEGER NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (currency_id) REFERENCES currencies(id)
);

-- Medical Record Line Items (Per-Record Items)
CREATE TABLE IF NOT EXISTS medical_record_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medical_record_id INTEGER NOT NULL,
    template_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    unit_price REAL NOT NULL,
    currency_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES line_item_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (currency_id) REFERENCES currencies(id)
);

-- Add pricing fields to medical_records
ALTER TABLE medical_records ADD COLUMN discount_percent REAL;
ALTER TABLE medical_records ADD COLUMN manual_total REAL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_line_item_templates_active ON line_item_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_medical_record_line_items_record ON medical_record_line_items(medical_record_id);
