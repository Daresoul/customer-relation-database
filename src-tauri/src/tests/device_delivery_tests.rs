//! Delivering a device result: saved file first, then the frontend event with
//! its file id; failures become a device event and a "couldn't read" row.

use crate::commands::file_history::recent_device_files;
use crate::models::device_integration::{ConnectionType, CreateDeviceIntegrationInput, DeviceType};
use crate::services::device_events::{
    classify_parse_error, deliver_result, report_cut_off, DeviceEvent, DeviceEventKind,
    DeviceSink, ResultSource,
};
use crate::services::device_integration::DeviceIntegrationService;
use crate::services::device_parser::DeviceData;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const RAW_CHEM: &[u8] = include_bytes!("../../tests/fixtures/real_chem_pcv.bin");

fn chem_frame() -> Vec<u8> {
    // Strip the MLLP start byte and the trailing FS CR, as the frame assembler does.
    RAW_CHEM[1..RAW_CHEM.len() - 2].to_vec()
}

struct RecordingSink {
    storage_dir: PathBuf,
    results: Mutex<Vec<serde_json::Value>>,
    /// For each result: was its file already on disk when the event went out?
    file_on_disk_at_emit: Mutex<Vec<bool>>,
    events: Mutex<Vec<DeviceEvent>>,
    recorded: Mutex<Vec<i64>>,
}

impl RecordingSink {
    fn new(storage_dir: &Path) -> Self {
        Self {
            storage_dir: storage_dir.to_path_buf(),
            results: Mutex::new(vec![]),
            file_on_disk_at_emit: Mutex::new(vec![]),
            events: Mutex::new(vec![]),
            recorded: Mutex::new(vec![]),
        }
    }
}

impl DeviceSink for RecordingSink {
    fn result_ready(&self, payload: &serde_json::Value, _data: &DeviceData) {
        let on_disk = payload["fileId"]
            .as_str()
            .map(|id| self.storage_dir.join(id).exists())
            .unwrap_or(false);
        self.file_on_disk_at_emit.lock().unwrap().push(on_disk);
        self.results.lock().unwrap().push(payload.clone());
    }
    fn device_event(&self, event: &DeviceEvent) {
        self.events.lock().unwrap().push(event.clone());
    }
    fn result_recorded(&self, integration_id: i64) {
        self.recorded.lock().unwrap().push(integration_id);
    }
}

async fn chem_integration(db: &DatabaseConnection) -> i64 {
    DeviceIntegrationService::create(
        db,
        CreateDeviceIntegrationInput {
            name: "Chemistry".to_string(),
            device_type: DeviceType::MnchipPointcareChemistry,
            connection_type: ConnectionType::SerialPort,
            watch_directory: None,
            file_pattern: None,
            serial_port_name: Some("COM3".to_string()),
            serial_baud_rate: None,
            tcp_host: None,
            tcp_port: None,
        },
    )
    .await
    .unwrap()
    .id
}

fn serial_source(integration_id: i64) -> ResultSource {
    ResultSource {
        integration_id,
        device_name: "COM3".to_string(),
        device_type: "mnchip_pointcare_chemistry".to_string(),
        connection_method: "serial_port".to_string(),
    }
}

async fn history_row(db: &DatabaseConnection, file_id: &str) -> (String, Option<String>, String) {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT status, error, file_path FROM file_access_history WHERE file_id = ?",
            [file_id.into()],
        ))
        .await
        .unwrap()
        .expect("history row must exist");
    (
        row.try_get("", "status").unwrap(),
        row.try_get("", "error").unwrap(),
        row.try_get("", "file_path").unwrap(),
    )
}

#[test]
fn parse_errors_with_no_values_are_empty_results() {
    assert_eq!(
        classify_parse_error("Healvet data yielded no analyte values (1 message(s), 3 metadata field(s))"),
        DeviceEventKind::EmptyResult
    );
    assert_eq!(
        classify_parse_error("HL7 data from mnchip_pcr_analyzer yielded no analyte values (no OBX result; 4 other field(s))"),
        DeviceEventKind::EmptyResult
    );
    assert_eq!(
        classify_parse_error("Exigo XML yielded no data (no <sample> attributes, <Parameter> blocks, or text elements found)"),
        DeviceEventKind::EmptyResult
    );
    assert_eq!(classify_parse_error("No valid Healvet messages found in data"), DeviceEventKind::ParseFailed);
    assert_eq!(classify_parse_error("Invalid UTF-8 in XML file: x"), DeviceEventKind::ParseFailed);
}

#[test]
fn every_event_kind_has_a_devices_message_key() {
    for kind in [
        DeviceEventKind::ParseFailed,
        DeviceEventKind::EmptyResult,
        DeviceEventKind::CutOff,
        DeviceEventKind::SaveFailed,
        DeviceEventKind::FolderLost,
    ] {
        assert!(kind.message_key().starts_with("events."), "{kind:?}");
    }
}

#[tokio::test]
async fn a_parsed_result_is_saved_before_the_event_and_the_event_carries_its_file_id() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    let delivery = deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;

    assert!(delivery.parsed);
    let results = sink.results.lock().unwrap().clone();
    assert_eq!(results.len(), 1);
    let file_id = results[0]["fileId"].as_str().expect("payload must carry fileId").to_string();
    assert_eq!(delivery.file_id.as_deref(), Some(file_id.as_str()));
    assert_eq!(*sink.file_on_disk_at_emit.lock().unwrap(), vec![true]);
    // Existing payload fields stay as they were.
    assert_eq!(results[0]["deviceType"], "mnchip_pointcare_chemistry");
    assert!(results[0]["testResults"].is_object());

    let (status, error, _) = history_row(&db, &file_id).await;
    assert_eq!(status, "ok");
    assert!(error.is_none());
    assert!(sink.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_parsed_result_records_the_last_result_time() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;

    let times = DeviceIntegrationService::last_result_times(&db).await.unwrap();
    assert!(times.contains_key(&id), "last_result_at must be persisted");
    assert_eq!(*sink.recorded.lock().unwrap(), vec![id]);
}

#[tokio::test]
async fn an_unreadable_frame_keeps_its_raw_bytes_and_raises_a_device_event() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());
    let garbage = b"\x00\x7fnot a lab result\xff".to_vec();

    let delivery = deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &garbage).await;

    assert!(!delivery.parsed);
    assert!(sink.results.lock().unwrap().is_empty(), "nothing to import");
    let events = sink.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, DeviceEventKind::ParseFailed);
    assert_eq!(events[0].integration_id, Some(id));
    assert_eq!(events[0].device_name, "Chemistry");
    assert_eq!(events[0].message_key, DeviceEventKind::ParseFailed.message_key());
    let file_id = events[0].file_id.clone().expect("event must point at the saved bytes");
    assert_eq!(delivery.file_id.as_deref(), Some(file_id.as_str()));

    let (status, error, path) = history_row(&db, &file_id).await;
    assert_eq!(status, "failed");
    assert!(error.unwrap_or_default().len() > 0);
    assert_eq!(std::fs::read(path).unwrap(), garbage, "raw bytes must be kept as received");
}

#[tokio::test]
async fn a_result_with_no_values_is_an_empty_result_event() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());
    let header_only = b"MSH|^~\\&|1|PointcareV|||20260115003112|2|ORU^R01|1|P|2.3.1||||0||ASCII|||\rPID|1||DOG|||||\r";

    deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", header_only).await;

    let events = sink.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, DeviceEventKind::EmptyResult);
}

#[tokio::test]
async fn a_cut_off_frame_is_kept_and_reported() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    let file_id = report_cut_off(&db, dir.path(), &sink, &serial_source(id), b"MSH|^~\\&|1|Pointc")
        .await
        .expect("partial bytes must be saved");

    let events = sink.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, DeviceEventKind::CutOff);
    assert_eq!(events[0].file_id.as_deref(), Some(file_id.as_str()));
    let (status, _, path) = history_row(&db, &file_id).await;
    assert_eq!(status, "failed");
    assert_eq!(std::fs::read(path).unwrap(), b"MSH|^~\\&|1|Pointc");
}

#[tokio::test]
async fn a_save_failure_still_delivers_the_result_and_says_so() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    // A file where the storage folder should be: every write fails.
    let blocked = dir.path().join("not-a-dir");
    std::fs::write(&blocked, b"x").unwrap();
    let sink = RecordingSink::new(&blocked);

    let delivery = deliver_result(&db, &blocked, &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;

    assert!(delivery.parsed);
    assert_eq!(delivery.file_id, None);
    let results = sink.results.lock().unwrap().clone();
    assert_eq!(results.len(), 1, "the import must still open");
    assert!(results[0].get("fileId").map(|v| v.is_null()).unwrap_or(true));
    let events = sink.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, DeviceEventKind::SaveFailed);
}

#[tokio::test]
async fn recent_device_files_shows_failed_rows_with_their_error() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;
    deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", b"garbage").await;

    let files = recent_device_files(&db, 14).await.unwrap();
    assert_eq!(files.len(), 2);
    let failed: Vec<_> = files.iter().filter(|f| f.file_history.status == "failed").collect();
    assert_eq!(failed.len(), 1);
    assert!(failed[0].file_history.error.is_some());
    let json = serde_json::to_value(failed[0]).unwrap();
    assert_eq!(json["status"], "failed");
    assert!(json["error"].is_string());
}

#[tokio::test]
async fn device_health_migration_adds_status_columns_and_sample_table() {
    let db = create_test_db_with_migrations().await;
    for (table, column) in [
        ("file_access_history", "status"),
        ("file_access_history", "error"),
        ("device_integrations", "last_result_at"),
        ("device_processed_samples", "sample_key"),
    ] {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS c FROM pragma_table_info(?) WHERE name = ?",
                [table.into(), column.into()],
            ))
            .await
            .unwrap()
            .unwrap();
        let c: i64 = row.try_get("", "c").unwrap();
        assert_eq!(c, 1, "{table}.{column} missing");
    }
}

async fn history_device_name(db: &DatabaseConnection, file_id: &str) -> String {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT device_name FROM file_access_history WHERE file_id = ?",
            [file_id.into()],
        ))
        .await
        .unwrap()
        .expect("history row must exist");
    row.try_get("", "device_name").unwrap()
}

#[tokio::test]
async fn a_serial_result_is_named_by_its_machine_not_its_port() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    let delivery = deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;

    let results = sink.results.lock().unwrap().clone();
    assert_eq!(results[0]["deviceName"], "Chemistry");
    assert_eq!(history_device_name(&db, &delivery.file_id.unwrap()).await, "Chemistry");
}

#[tokio::test]
async fn a_cut_off_serial_frame_is_named_by_its_machine() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    let file_id = report_cut_off(&db, dir.path(), &sink, &serial_source(id), b"MSH|^~\\&|1|Pointc")
        .await
        .unwrap();

    assert_eq!(history_device_name(&db, &file_id).await, "Chemistry");
}

#[tokio::test]
async fn a_result_from_a_removed_integration_keeps_the_port_name() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let sink = RecordingSink::new(dir.path());

    deliver_result(&db, dir.path(), &sink, &serial_source(9999), "chem.hl7", &chem_frame()).await;

    let results = sink.results.lock().unwrap().clone();
    assert_eq!(results[0]["deviceName"], "COM3");
}

fn healvet_source(integration_id: i64) -> ResultSource {
    ResultSource {
        integration_id,
        device_name: "COM4".to_string(),
        device_type: "healvet_hv_fia_3000".to_string(),
        connection_method: "serial_port".to_string(),
    }
}

// parsers M3: a Healvet stream holding two samples became one blended result.
#[tokio::test]
async fn a_healvet_stream_with_two_samples_is_delivered_as_two_results() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let sink = RecordingSink::new(dir.path());
    let wire = b"#AFS1000&S1&12.5&06-04-2026 11:00:00&&cCRP&REX&&M&Serum&#AFS1000&S2&3.1&06-04-2026 11:20:00&&T4-1&LUNA&&F&Serum&EE";

    let delivery = deliver_result(&db, dir.path(), &sink, &healvet_source(77), "healvet.txt", wire).await;

    assert!(delivery.parsed);
    let results = sink.results.lock().unwrap().clone();
    assert_eq!(results.len(), 2, "{results:?}");
    assert_eq!(results[0]["patientIdentifier"], "REX");
    assert_eq!(results[1]["patientIdentifier"], "LUNA");
    assert!(results[1]["testResults"].get("cCRP").is_none());
    assert!(results.iter().all(|r| r["fileId"].is_string()));
}

// connection-followup #7: a machine that resends the same frame must not
// make a second result.
#[tokio::test]
async fn the_same_serial_frame_again_within_ten_minutes_is_dropped() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;
    deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;

    assert_eq!(sink.results.lock().unwrap().len(), 1);
    let row = db
        .query_one(Statement::from_string(DbBackend::Sqlite, "SELECT COUNT(*) AS c FROM file_access_history".to_string()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.try_get::<i64>("", "c").unwrap(), 1);
}

#[tokio::test]
async fn the_same_frame_from_another_machine_is_still_delivered() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let id = chem_integration(&db).await;
    let sink = RecordingSink::new(dir.path());

    deliver_result(&db, dir.path(), &sink, &serial_source(id), "chem.hl7", &chem_frame()).await;
    deliver_result(&db, dir.path(), &sink, &serial_source(id + 1000), "chem.hl7", &chem_frame()).await;

    assert_eq!(sink.results.lock().unwrap().len(), 2);
}

#[test]
fn frame_repeats_are_remembered_for_ten_minutes() {
    use crate::services::device_events::FrameMemory;
    use std::time::{Duration, Instant};
    let mut memory = FrameMemory::default();
    let t0 = Instant::now();
    assert!(!memory.seen_recently(1, b"abc", t0));
    assert!(memory.seen_recently(1, b"abc", t0 + Duration::from_secs(9 * 60)));
    assert!(!memory.seen_recently(2, b"abc", t0 + Duration::from_secs(9 * 60)));
    assert!(!memory.seen_recently(1, b"abd", t0 + Duration::from_secs(9 * 60)));
    assert!(!memory.seen_recently(1, b"abc", t0 + Duration::from_secs(30 * 60)));
}
