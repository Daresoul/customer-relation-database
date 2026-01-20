//! Test utilities for integration tests
//!
//! Provides helpers to create in-memory databases with test data.

use sea_orm::{Database, DatabaseConnection, ConnectionTrait, DbBackend, Statement};
use chrono::{DateTime, Utc, Duration, TimeZone};

/// Create an in-memory SQLite database with full schema
pub async fn create_test_db() -> DatabaseConnection {
    let db = Database::connect("sqlite::memory:")
        .await
        .expect("Failed to create test database");

    // Enable foreign keys
    db.execute_unprepared("PRAGMA foreign_keys = ON")
        .await
        .expect("Failed to enable foreign keys");

    // Create minimal schema for appointments tests
    create_test_schema(&db).await;

    db
}

/// Create the minimal schema needed for testing
async fn create_test_schema(db: &DatabaseConnection) {
    // Species table
    db.execute_unprepared(
        r#"
        CREATE TABLE species (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#3498db',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .await
    .expect("Failed to create species table");

    // Breeds table
    db.execute_unprepared(
        r#"
        CREATE TABLE breeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            species_id INTEGER REFERENCES species(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .await
    .expect("Failed to create breeds table");

    // Patients table
    db.execute_unprepared(
        r#"
        CREATE TABLE patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            species_id INTEGER REFERENCES species(id),
            breed_id INTEGER REFERENCES breeds(id),
            microchip_id TEXT,
            date_of_birth DATE,
            gender TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .await
    .expect("Failed to create patients table");

    // Rooms table
    db.execute_unprepared(
        r#"
        CREATE TABLE rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            capacity INTEGER DEFAULT 1,
            color TEXT DEFAULT '#3498db',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .await
    .expect("Failed to create rooms table");

    // Appointments table
    db.execute_unprepared(
        r#"
        CREATE TABLE appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES patients(id),
            title TEXT NOT NULL,
            description TEXT,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            room_id INTEGER REFERENCES rooms(id),
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )
        "#,
    )
    .await
    .expect("Failed to create appointments table");
}

/// Insert test species and return the ID
pub async fn create_test_species(db: &DatabaseConnection, name: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO species (name) VALUES (?) RETURNING id",
        [name.into()],
    ))
    .await
    .expect("Failed to create species");

    // Get the last inserted ID
    let result = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT last_insert_rowid() as id".to_string(),
        ))
        .await
        .expect("Failed to get species ID")
        .expect("No result");

    result.try_get("", "id").expect("Failed to get ID")
}

/// Insert test breed and return the ID
pub async fn create_test_breed(db: &DatabaseConnection, name: &str, species_id: i64) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO breeds (name, species_id) VALUES (?, ?)",
        [name.into(), species_id.into()],
    ))
    .await
    .expect("Failed to create breed");

    let result = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT last_insert_rowid() as id".to_string(),
        ))
        .await
        .expect("Failed to get breed ID")
        .expect("No result");

    result.try_get("", "id").expect("Failed to get ID")
}

/// Insert test patient and return the ID
pub async fn create_test_patient(
    db: &DatabaseConnection,
    name: &str,
    species_id: i64,
    breed_id: Option<i64>,
) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO patients (name, species_id, breed_id) VALUES (?, ?, ?)",
        [name.into(), species_id.into(), breed_id.map(|id| id.into()).unwrap_or(sea_orm::Value::Int(None))],
    ))
    .await
    .expect("Failed to create patient");

    let result = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT last_insert_rowid() as id".to_string(),
        ))
        .await
        .expect("Failed to get patient ID")
        .expect("No result");

    result.try_get("", "id").expect("Failed to get ID")
}

/// Insert test room and return the ID
pub async fn create_test_room(db: &DatabaseConnection, name: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO rooms (name) VALUES (?)",
        [name.into()],
    ))
    .await
    .expect("Failed to create room");

    let result = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT last_insert_rowid() as id".to_string(),
        ))
        .await
        .expect("Failed to get room ID")
        .expect("No result");

    result.try_get("", "id").expect("Failed to get ID")
}

/// Create a standard test time (today at 10:00 AM UTC)
pub fn test_time(hour: u32, minute: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2024, 6, 15, hour, minute, 0).unwrap()
}

/// Create a time that's a 15-minute interval
pub fn test_time_slot(hour: u32, quarter: u32) -> DateTime<Utc> {
    test_time(hour, quarter * 15)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_test_db() {
        let db = create_test_db().await;

        // Verify tables exist
        let result = db
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT name FROM sqlite_master WHERE type='table' AND name='appointments'".to_string(),
            ))
            .await
            .expect("Query failed");

        assert!(result.is_some(), "appointments table should exist");
    }

    #[tokio::test]
    async fn test_create_test_data() {
        let db = create_test_db().await;

        let species_id = create_test_species(&db, "Dog").await;
        let breed_id = create_test_breed(&db, "Golden Retriever", species_id).await;
        let patient_id = create_test_patient(&db, "Max", species_id, Some(breed_id)).await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        assert!(species_id > 0);
        assert!(breed_id > 0);
        assert!(patient_id > 0);
        assert!(room_id > 0);
    }
}
