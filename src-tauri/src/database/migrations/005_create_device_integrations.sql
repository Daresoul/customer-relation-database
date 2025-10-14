-- Create device_integrations table for managing external lab device connections
CREATE TABLE IF NOT EXISTS device_integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK(device_type IN ('exigo_eos_vet', 'healvet_hv_fia_3000', 'mnchip_pointcare_pcr_v1')),
    connection_type TEXT NOT NULL CHECK(connection_type IN ('file_watch', 'serial_port', 'hl7_tcp')),

    -- File watching settings
    watch_directory TEXT,
    file_pattern TEXT,

    -- Serial port settings
    serial_port_name TEXT,
    serial_baud_rate INTEGER DEFAULT 9600,

    -- HL7 TCP settings (future use)
    tcp_host TEXT,
    tcp_port INTEGER,

    -- Status and metadata
    enabled INTEGER DEFAULT 1 CHECK(enabled IN (0, 1)),
    last_connected_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
);

-- Create index for querying enabled devices
CREATE INDEX IF NOT EXISTS idx_device_integrations_enabled ON device_integrations(enabled) WHERE deleted_at IS NULL;

-- Create index for device type lookups
CREATE INDEX IF NOT EXISTS idx_device_integrations_device_type ON device_integrations(device_type) WHERE deleted_at IS NULL;
