-- Create species table
CREATE TABLE IF NOT EXISTS species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default species
INSERT INTO species (name, display_order) VALUES
    ('Dog', 1),
    ('Cat', 2),
    ('Bird', 3),
    ('Rabbit', 4),
    ('Hamster', 5),
    ('Guinea Pig', 6),
    ('Reptile', 7),
    ('Fish', 8),
    ('Other', 9);

-- Create index on active species
CREATE INDEX idx_species_active ON species(active);

-- Create trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_species_timestamp
AFTER UPDATE ON species
BEGIN
    UPDATE species SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
