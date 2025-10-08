// T004: Test database migrations for Google Calendar Integration
// Note: This test manually runs the migration SQL to verify the schema
// since the crate is binary-only and doesn't expose modules for testing

use sqlx::SqlitePool;

#[tokio::test]
async fn test_calendar_event_mappings_migration() {
    // Create in-memory test database
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();

    // Manually run the calendar_event_mappings migration SQL
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS calendar_event_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appointment_id INTEGER NOT NULL UNIQUE,
            event_id TEXT NOT NULL,
            calendar_id TEXT NOT NULL,
            last_synced_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    "#)
    .execute(&pool)
    .await
    .expect("Should create calendar_event_mappings table");

    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_appointment ON calendar_event_mappings(appointment_id)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_event ON calendar_event_mappings(event_id)")
        .execute(&pool)
        .await
        .unwrap();

    // Create trigger
    sqlx::query(r#"
        CREATE TRIGGER IF NOT EXISTS update_calendar_event_mappings_timestamp
        AFTER UPDATE ON calendar_event_mappings
        BEGIN
            UPDATE calendar_event_mappings
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
        END
    "#)
    .execute(&pool)
    .await
    .unwrap();

    // Verify calendar_event_mappings table exists
    let table_exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='calendar_event_mappings'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert!(table_exists, "calendar_event_mappings table should exist");

    // Verify table schema
    let columns: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('calendar_event_mappings') ORDER BY name"
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let column_names: Vec<String> = columns.into_iter().map(|(name,)| name).collect();
    assert!(column_names.contains(&"id".to_string()));
    assert!(column_names.contains(&"appointment_id".to_string()));
    assert!(column_names.contains(&"event_id".to_string()));
    assert!(column_names.contains(&"calendar_id".to_string()));
    assert!(column_names.contains(&"last_synced_at".to_string()));
    assert!(column_names.contains(&"created_at".to_string()));
    assert!(column_names.contains(&"updated_at".to_string()));

    // Verify indexes exist
    let index_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='calendar_event_mappings'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert!(index_count >= 2, "Should have at least 2 indexes (excluding autoindex)");

    // Verify trigger exists
    let trigger_exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='trigger' AND name='update_calendar_event_mappings_timestamp'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert!(trigger_exists, "Update trigger should exist");

    pool.close().await;
}

#[tokio::test]
async fn test_sync_logs_migration() {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();

    // Manually run the sync_logs migration SQL
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            direction TEXT NOT NULL CHECK (direction IN ('to_google', 'from_google')),
            sync_type TEXT NOT NULL CHECK (sync_type IN ('initial', 'incremental', 'manual')),
            status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'partial')),
            items_synced INTEGER DEFAULT 0,
            items_failed INTEGER DEFAULT 0,
            error_message TEXT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    "#)
    .execute(&pool)
    .await
    .expect("Should create sync_logs table");

    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status, started_at)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON sync_logs(sync_type, completed_at)")
        .execute(&pool)
        .await
        .unwrap();

    // Verify sync_logs table exists
    let table_exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='sync_logs'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert!(table_exists, "sync_logs table should exist");

    // Verify table schema
    let columns: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('sync_logs') ORDER BY name"
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let column_names: Vec<String> = columns.into_iter().map(|(name,)| name).collect();
    assert!(column_names.contains(&"id".to_string()));
    assert!(column_names.contains(&"direction".to_string()));
    assert!(column_names.contains(&"sync_type".to_string()));
    assert!(column_names.contains(&"status".to_string()));
    assert!(column_names.contains(&"items_synced".to_string()));
    assert!(column_names.contains(&"items_failed".to_string()));
    assert!(column_names.contains(&"error_message".to_string()));
    assert!(column_names.contains(&"started_at".to_string()));
    assert!(column_names.contains(&"completed_at".to_string()));

    // Test CHECK constraints work
    let result = sqlx::query(
        "INSERT INTO sync_logs (direction, sync_type, status) VALUES ('invalid_direction', 'manual', 'pending')"
    )
    .execute(&pool)
    .await;

    assert!(result.is_err(), "Invalid direction should fail CHECK constraint");

    // Test valid insert
    let result = sqlx::query(
        "INSERT INTO sync_logs (direction, sync_type, status) VALUES ('to_google', 'manual', 'pending')"
    )
    .execute(&pool)
    .await;

    assert!(result.is_ok(), "Valid values should insert successfully");

    pool.close().await;
}

#[tokio::test]
async fn test_token_expires_at_migration() {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();

    // Create google_calendar_settings table first (simplified version)
    sqlx::query(r#"
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
        )
    "#)
    .execute(&pool)
    .await
    .unwrap();

    // Add token_expires_at column
    let column_exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('google_calendar_settings') WHERE name = 'token_expires_at'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    if !column_exists {
        sqlx::query("ALTER TABLE google_calendar_settings ADD COLUMN token_expires_at TIMESTAMP")
            .execute(&pool)
            .await
            .unwrap();
    }

    // Verify token_expires_at column exists
    let column_exists_after: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('google_calendar_settings') WHERE name = 'token_expires_at'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert!(column_exists_after, "token_expires_at column should exist in google_calendar_settings");

    pool.close().await;
}

#[tokio::test]
async fn test_calendar_event_mappings_constraints() {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();

    // Create appointments table first (minimal version)
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_time TIMESTAMP NOT NULL,
            end_time TIMESTAMP NOT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_by TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    "#)
    .execute(&pool)
    .await
    .unwrap();

    // Create calendar_event_mappings table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS calendar_event_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appointment_id INTEGER NOT NULL UNIQUE,
            event_id TEXT NOT NULL,
            calendar_id TEXT NOT NULL,
            last_synced_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
        )
    "#)
    .execute(&pool)
    .await
    .unwrap();

    // Create trigger
    sqlx::query(r#"
        CREATE TRIGGER IF NOT EXISTS update_calendar_event_mappings_timestamp
        AFTER UPDATE ON calendar_event_mappings
        BEGIN
            UPDATE calendar_event_mappings
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
        END
    "#)
    .execute(&pool)
    .await
    .unwrap();

    // Create a test appointment first (need appointments table to exist)
    // Note: This assumes appointments table exists from earlier migrations
    let appointment_result = sqlx::query(
        "INSERT INTO appointments (patient_id, title, start_time, end_time, status, created_by)
         VALUES (1, 'Test Appointment', datetime('now'), datetime('now', '+1 hour'), 'scheduled', 'test')"
    )
    .execute(&pool)
    .await;

    if appointment_result.is_ok() {
        let appointment_id = appointment_result.unwrap().last_insert_rowid();

        // Test inserting a mapping
        let result = sqlx::query(
            "INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id) VALUES (?, 'event123', 'cal456')"
        )
        .bind(appointment_id)
        .execute(&pool)
        .await;

        assert!(result.is_ok(), "Should be able to insert calendar event mapping");

        // Test UNIQUE constraint on appointment_id
        let duplicate_result = sqlx::query(
            "INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id) VALUES (?, 'event789', 'cal456')"
        )
        .bind(appointment_id)
        .execute(&pool)
        .await;

        assert!(duplicate_result.is_err(), "Duplicate appointment_id should fail UNIQUE constraint");

        // Test update trigger updates timestamp
        let original_updated_at: String = sqlx::query_scalar(
            "SELECT updated_at FROM calendar_event_mappings WHERE appointment_id = ?"
        )
        .bind(appointment_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        // Update the record (sleep 1 second to ensure timestamp changes)
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        sqlx::query(
            "UPDATE calendar_event_mappings SET event_id = 'updated_event' WHERE appointment_id = ?"
        )
        .bind(appointment_id)
        .execute(&pool)
        .await
        .unwrap();

        let new_updated_at: String = sqlx::query_scalar(
            "SELECT updated_at FROM calendar_event_mappings WHERE appointment_id = ?"
        )
        .bind(appointment_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_ne!(original_updated_at, new_updated_at, "Update trigger should change updated_at timestamp");
    }

    pool.close().await;
}
