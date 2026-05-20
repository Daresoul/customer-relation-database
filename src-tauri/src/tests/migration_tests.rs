//! Migration smoke tests — every migration must be idempotent so a crashed
//! boot can re-run safely. Most edge-case bugs in migrations show up here.

use crate::database::migrations::run_migrations;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DbBackend, Statement};

/// Helper: count rows in any table.
async fn count(db: &sea_orm::DatabaseConnection, table: &str) -> i64 {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        &format!("SELECT COUNT(*) AS c FROM {}", table),
        vec![],
    ))
    .await
    .unwrap()
    .unwrap()
    .try_get("", "c")
    .unwrap()
}

async fn column_notnull(
    db: &sea_orm::DatabaseConnection,
    table: &str,
    column: &str,
) -> Option<i64> {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT \"notnull\" FROM pragma_table_info(?) WHERE name = ?",
        [table.into(), column.into()],
    ))
    .await
    .unwrap()
    .and_then(|r| r.try_get("", "notnull").ok())
}

#[tokio::test]
async fn migrations_run_to_completion_on_fresh_db() {
    let db = create_test_db_with_migrations().await;
    // If we got here, every migration succeeded. Verify the tracking table
    // recorded them.
    let migration_count = count(&db, "migrations").await;
    assert!(migration_count >= 40, "expected ≥40 migrations recorded, got {}", migration_count);
}

#[tokio::test]
async fn migrations_are_idempotent_on_second_run() {
    let test_db = create_test_db_with_migrations().await;
    // Migrations already ran once; run them again — should no-op.
    let pool = test_db.db.get_sqlite_connection_pool().clone();

    let first_count = count(&test_db, "migrations").await;
    run_migrations(&pool).await.expect("second run should be no-op");
    let second_count = count(&test_db, "migrations").await;

    assert_eq!(first_count, second_count, "no new migration rows on rerun");
}

#[tokio::test]
async fn migration_041_makes_patient_name_nullable() {
    // Pin the recent schema relaxation. If a future migration tightens the
    // constraint again, this test catches it.
    let db = create_test_db_with_migrations().await;
    let notnull = column_notnull(&db, "patients", "name").await.expect("name column exists");
    assert_eq!(notnull, 0, "patients.name should be nullable after migration 041");
}

#[tokio::test]
async fn migration_041_makes_patient_species_id_nullable() {
    let db = create_test_db_with_migrations().await;
    let notnull = column_notnull(&db, "patients", "species_id").await.expect("species_id column exists");
    assert_eq!(notnull, 0, "patients.species_id should be nullable after migration 041");
}

#[tokio::test]
async fn species_seeded_with_default_rows() {
    let db = create_test_db_with_migrations().await;
    let n = count(&db, "species").await;
    assert!(n >= 9, "expected ≥9 seeded species, got {}", n);
}

#[tokio::test]
async fn currencies_seeded_with_default_rows() {
    let db = create_test_db_with_migrations().await;
    let n = count(&db, "currencies").await;
    assert!(n >= 1, "expected ≥1 seeded currency, got {}", n);
}

#[tokio::test]
async fn rooms_seeded_with_default_row() {
    let db = create_test_db_with_migrations().await;
    let n = count(&db, "rooms").await;
    assert!(n >= 1, "expected ≥1 seeded room, got {}", n);
}

#[tokio::test]
async fn foreign_keys_pragma_is_enabled() {
    // FK enforcement is required for the cascading delete tests + safety
    // checks across the codebase. Pin it.
    let db = create_test_db_with_migrations().await;
    let row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "PRAGMA foreign_keys",
        vec![],
    )).await.unwrap().unwrap();
    let on: i64 = row.try_get("", "foreign_keys").unwrap();
    assert_eq!(on, 1, "foreign_keys pragma must be ON");
}

#[tokio::test]
async fn essential_tables_exist() {
    // Schema smoke test — names every downstream test relies on.
    let db = create_test_db_with_migrations().await;
    for table in [
        "patients",
        "households",
        "people",
        "person_contacts",
        "patient_households",
        "species",
        "breeds",
        "currencies",
        "medical_records",
        "medical_record_history",
        "medical_attachments",
        "appointments",
        "rooms",
        "app_settings",
        "device_integrations",
        "pending_device_entries",
        "file_access_history",
        "line_item_templates",
        "medical_record_line_items",
        "household_search",
        "medical_records_fts",
        "migrations",
    ] {
        let result = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT name FROM sqlite_master WHERE name = ? AND (type='table' OR type='virtual')",
                [table.into()],
            ))
            .await
            .unwrap();
        assert!(result.is_some(), "missing table: {}", table);
    }
}
