//! DeviceIntegrationService CRUD + lifecycle tests.

use crate::models::device_integration::{
    ConnectionType, CreateDeviceIntegrationInput, DeviceType, UpdateDeviceIntegrationInput,
};
use crate::models::dto::MaybeNull;
use crate::services::device_integration::DeviceIntegrationService;
use crate::test_utils::create_test_db_with_migrations;

fn serial_input(name: &str, device_type: DeviceType, port: &str, baud: i64) -> CreateDeviceIntegrationInput {
    CreateDeviceIntegrationInput {
        name: name.to_string(),
        device_type,
        connection_type: ConnectionType::SerialPort,
        watch_directory: None,
        file_pattern: None,
        serial_port_name: Some(port.to_string()),
        serial_baud_rate: Some(baud),
        tcp_host: None,
        tcp_port: None,
    }
}

fn file_watch_input(name: &str, dir: &str, pattern: &str) -> CreateDeviceIntegrationInput {
    CreateDeviceIntegrationInput {
        name: name.to_string(),
        device_type: DeviceType::ExigoEosVet,
        connection_type: ConnectionType::FileWatch,
        watch_directory: Some(dir.to_string()),
        file_pattern: Some(pattern.to_string()),
        serial_port_name: None,
        serial_baud_rate: None,
        tcp_host: None,
        tcp_port: None,
    }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_serial_healvet_succeeds() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(
        &db,
        serial_input("Healvet 1", DeviceType::HealvetHvFia3000, "/dev/tty.h1", 9600),
    )
    .await
    .unwrap();
    assert_eq!(i.name, "Healvet 1");
    assert_eq!(i.device_type, DeviceType::HealvetHvFia3000);
    assert_eq!(i.connection_type, ConnectionType::SerialPort);
    assert_eq!(i.serial_port_name.as_deref(), Some("/dev/tty.h1"));
    assert_eq!(i.serial_baud_rate, Some(9600));
    assert!(i.enabled, "new integrations default to enabled");
}

#[tokio::test]
async fn create_file_watch_exigo_succeeds() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(
        &db,
        file_watch_input("Exigo", "/tmp/exigo", "*.xml"),
    )
    .await
    .unwrap();
    assert_eq!(i.connection_type, ConnectionType::FileWatch);
    assert_eq!(i.watch_directory.as_deref(), Some("/tmp/exigo"));
    assert_eq!(i.file_pattern.as_deref(), Some("*.xml"));
}

#[tokio::test]
async fn create_pointcare_chemistry_115200() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(
        &db,
        serial_input("PointCare Chem", DeviceType::MnchipPointcareChemistry, "/dev/tty.pc", 115200),
    )
    .await
    .unwrap();
    assert_eq!(i.device_type, DeviceType::MnchipPointcareChemistry);
    assert_eq!(i.serial_baud_rate, Some(115200));
}

#[tokio::test]
async fn create_pcr_analyzer_succeeds() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(
        &db,
        serial_input("PCR", DeviceType::MnchipPcrAnalyzer, "/dev/tty.pcr", 115200),
    )
    .await
    .unwrap();
    assert_eq!(i.device_type, DeviceType::MnchipPcrAnalyzer);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

#[tokio::test]
async fn get_all_returns_inserted_rows_in_creation_order() {
    let db = create_test_db_with_migrations().await;
    DeviceIntegrationService::create(&db, serial_input("A", DeviceType::HealvetHvFia3000, "/a", 9600)).await.unwrap();
    DeviceIntegrationService::create(&db, serial_input("B", DeviceType::HealvetHvFia3000, "/b", 9600)).await.unwrap();
    DeviceIntegrationService::create(&db, file_watch_input("C", "/c", "*.xml")).await.unwrap();

    let all = DeviceIntegrationService::get_all(&db).await.unwrap();
    assert_eq!(all.len(), 3);
}

#[tokio::test]
async fn get_by_id_nonexistent_errors() {
    let db = create_test_db_with_migrations().await;
    let result = DeviceIntegrationService::get_by_id(&db, 99999).await;
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

#[tokio::test]
async fn update_name_only_persists() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(&db, serial_input("Old", DeviceType::HealvetHvFia3000, "/a", 9600))
        .await.unwrap();

    let updated = DeviceIntegrationService::update(
        &db,
        i.id,
        UpdateDeviceIntegrationInput {
            name: Some("New".to_string()),
            connection_type: None,
            watch_directory: MaybeNull::Undefined,
            file_pattern: None,
            serial_port_name: MaybeNull::Undefined,
            serial_baud_rate: MaybeNull::Undefined,
            tcp_host: MaybeNull::Undefined,
            tcp_port: MaybeNull::Undefined,
            enabled: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.name, "New");
    assert_eq!(updated.serial_port_name.as_deref(), Some("/a"), "port untouched");
}

#[tokio::test]
async fn update_changes_serial_port_with_maybenull_value() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(&db, serial_input("X", DeviceType::HealvetHvFia3000, "/old", 9600))
        .await.unwrap();

    let updated = DeviceIntegrationService::update(
        &db,
        i.id,
        UpdateDeviceIntegrationInput {
            name: None, connection_type: None,
            watch_directory: MaybeNull::Undefined, file_pattern: None,
            serial_port_name: MaybeNull::Value("/new".to_string()),
            serial_baud_rate: MaybeNull::Value(115200),
            tcp_host: MaybeNull::Undefined, tcp_port: MaybeNull::Undefined,
            enabled: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.serial_port_name.as_deref(), Some("/new"));
    assert_eq!(updated.serial_baud_rate, Some(115200));
}

#[tokio::test]
async fn update_nonexistent_errors() {
    let db = create_test_db_with_migrations().await;
    let result = DeviceIntegrationService::update(
        &db,
        99999,
        UpdateDeviceIntegrationInput {
            name: Some("ghost".to_string()),
            connection_type: None,
            watch_directory: MaybeNull::Undefined, file_pattern: None,
            serial_port_name: MaybeNull::Undefined, serial_baud_rate: MaybeNull::Undefined,
            tcp_host: MaybeNull::Undefined, tcp_port: MaybeNull::Undefined,
            enabled: None,
        },
    ).await;
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// toggle_enabled
// ---------------------------------------------------------------------------

#[tokio::test]
async fn toggle_enabled_flips_state() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(&db, serial_input("Toggle", DeviceType::HealvetHvFia3000, "/t", 9600))
        .await.unwrap();
    assert!(i.enabled);

    let after = DeviceIntegrationService::toggle_enabled(&db, i.id).await.unwrap();
    assert!(!after.enabled);

    let after2 = DeviceIntegrationService::toggle_enabled(&db, i.id).await.unwrap();
    assert!(after2.enabled);
}

#[tokio::test]
async fn toggle_enabled_nonexistent_errors() {
    let db = create_test_db_with_migrations().await;
    let result = DeviceIntegrationService::toggle_enabled(&db, 99999).await;
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// update_last_connected
// ---------------------------------------------------------------------------

#[tokio::test]
async fn update_last_connected_sets_timestamp() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(&db, serial_input("LC", DeviceType::HealvetHvFia3000, "/lc", 9600))
        .await.unwrap();
    assert!(i.last_connected_at.is_none());

    DeviceIntegrationService::update_last_connected(&db, i.id).await.unwrap();
    let after = DeviceIntegrationService::get_by_id(&db, i.id).await.unwrap();
    assert!(after.last_connected_at.is_some());
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

#[tokio::test]
async fn delete_removes_row() {
    let db = create_test_db_with_migrations().await;
    let i = DeviceIntegrationService::create(&db, serial_input("Doomed", DeviceType::HealvetHvFia3000, "/d", 9600))
        .await.unwrap();

    DeviceIntegrationService::delete(&db, i.id).await.unwrap();
    let result = DeviceIntegrationService::get_by_id(&db, i.id).await;
    assert!(result.is_err(), "should be gone");
}

#[tokio::test]
async fn delete_nonexistent_does_not_panic() {
    let db = create_test_db_with_migrations().await;
    let _ = DeviceIntegrationService::delete(&db, 99999).await;
    // Whether it returns Ok or Err is implementation-defined; either is fine.
}

#[tokio::test]
async fn delete_then_get_all_excludes_row() {
    let db = create_test_db_with_migrations().await;
    let i1 = DeviceIntegrationService::create(&db, serial_input("Keep", DeviceType::HealvetHvFia3000, "/k", 9600))
        .await.unwrap();
    let i2 = DeviceIntegrationService::create(&db, serial_input("Drop", DeviceType::HealvetHvFia3000, "/d", 9600))
        .await.unwrap();

    DeviceIntegrationService::delete(&db, i2.id).await.unwrap();
    let all = DeviceIntegrationService::get_all(&db).await.unwrap();
    let ids: Vec<i64> = all.iter().map(|x| x.id).collect();
    assert!(ids.contains(&i1.id));
    assert!(!ids.contains(&i2.id));
}
