//! Machine status #1: the overview shows how many results each machine sent today.

use crate::services::device_integration::DeviceIntegrationService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn integration(db: &DatabaseConnection, name: &str, device_type: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO device_integrations (name, device_type, connection_type, watch_directory, file_pattern, enabled, created_at, updated_at) \
         VALUES (?, ?, 'file_watch', '/lab', '*.xml', 1, datetime('now'), datetime('now'))",
        [name.into(), device_type.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

async fn result(db: &DatabaseConnection, file_id: &str, name: &str, device_type: &str, received_at: &str, error: Option<&str>) {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO file_access_history (file_id, original_name, file_path, device_type, device_name, received_at, error) \
         VALUES (?, 'r.xml', '/tmp/r.xml', ?, ?, ?, ?)",
        [file_id.into(), device_type.into(), name.into(), received_at.into(), sea_orm::Value::String(error.map(|e| Box::new(e.to_string())))],
    ))
    .await
    .unwrap();
}

#[tokio::test]
async fn counts_todays_readable_results_per_machine() {
    let db = create_test_db_with_migrations().await;
    let exigo = integration(&db, "Exigo", "exigo_eos_vet").await;
    let healvet = integration(&db, "Healvet", "healvet_hv_fia_3000").await;
    result(&db, "a", "Exigo", "exigo_eos_vet", "2026-10-24 08:10:00", None).await;
    result(&db, "b", "Exigo", "exigo_eos_vet", "2026-10-24 09:30:00", None).await;
    result(&db, "c", "Exigo", "exigo_eos_vet", "2026-10-23 17:00:00", None).await;
    result(&db, "d", "Exigo", "exigo_eos_vet", "2026-10-24 10:00:00", Some("could not read")).await;

    use chrono::TimeZone;
    let since = chrono::Utc.with_ymd_and_hms(2026, 10, 24, 0, 0, 0).unwrap();
    let today = DeviceIntegrationService::results_since(&db, since).await.unwrap();
    assert_eq!(today.get(&exigo), Some(&2));
    assert_eq!(today.get(&healvet), None);
}
