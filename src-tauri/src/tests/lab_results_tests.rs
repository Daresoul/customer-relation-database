//! Lab values stored one per row (X3).

use crate::models::dto::CreatePatientDto;
use crate::services::file_watcher::split_exigo_samples;
use crate::services::lab_inbox;
use crate::services::lab_results::{self, AnalyteValue};
use crate::services::medical_record::PdfEnv;
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

const DAILY: &[u8] = include_bytes!("../../tests/fixtures/exigo_daily_two_samples.xml");

fn koko_xml() -> Vec<u8> {
    split_exigo_samples(DAILY).into_iter().next().expect("fixture has samples").xml
}

fn value<'a>(values: &'a [AnalyteValue], code: &str) -> &'a AnalyteValue {
    values.iter().find(|v| v.code == code).unwrap_or_else(|| panic!("no {} in {:?}", code, values))
}

async fn seed_patient(db: &DatabaseConnection, name: &str, species_id: i64) -> i64 {
    PatientService::create(
        db,
        CreatePatientDto {
            name: Some(name.to_string()),
            species_id: Some(species_id),
            breed_id: None,
            gender: None,
            date_of_birth: None,
            color: None,
            weight: None,
            microchip_id: None,
            medical_notes: None,
            household_id: None,
        },
    )
    .await
    .unwrap()
    .id
}

async fn seed_record(db: &DatabaseConnection, patient_id: i64, name: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', ?, 'Notes', 0, 1, '2026-10-20T10:00:00+00:00', '2026-10-20T10:00:00+00:00')",
        [patient_id.into(), name.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

/// A received Exigo result in the inbox, stored in `dir`.
async fn receive(db: &DatabaseConnection, dir: &std::path::Path, file_id: &str, bytes: &[u8]) {
    let path = dir.join(format!("history-{}", file_id));
    std::fs::write(&path, bytes).unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO file_access_history (file_id, original_name, file_path, file_size, mime_type, device_type, device_name, \
         connection_method, received_at, status) \
         VALUES (?, 'BM-53672_1219.xml', ?, ?, 'application/xml', 'exigo_eos_vet', 'Exigo', 'file_watch', '2026-10-23T08:00:00+00:00', 'ok')",
        [file_id.into(), path.display().to_string().into(), (bytes.len() as i64).into()],
    ))
    .await
    .unwrap();
}

/// A lab attachment stored in `dir` as an upload makes it.
async fn upload(
    db: &DatabaseConnection,
    dir: &std::path::Path,
    record_id: i64,
    stored_id: &str,
    device_type: &str,
    bytes: &[u8],
) -> i64 {
    std::fs::write(dir.join(stored_id), bytes).unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, mime_type, attachment_type, \
         device_type, device_name, uploaded_at) \
         VALUES (?, ?, 'result', 'application/json', 'test_result', ?, 'Machine', '2026-10-20T10:00:00+00:00')",
        [record_id.into(), stored_id.into(), device_type.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

async fn count(db: &DatabaseConnection, sql: &str) -> i64 {
    db.query_one(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
        .await
        .unwrap()
        .unwrap()
        .try_get_by_index::<i64>(0)
        .unwrap()
}

fn broken_env(storage: &tempfile::TempDir) -> PdfEnv {
    PdfEnv { jar_path: storage.path().join("missing.jar"), storage_dir: storage.path().to_path_buf() }
}

// ---------------------------------------------------------------------------
// Reading values, ranges and flags
// ---------------------------------------------------------------------------

#[test]
fn values_read_a_decimal_comma_and_a_less_or_greater_sign() {
    assert_eq!(lab_results::parse_value("1,5"), Some(1.5));
    assert_eq!(lab_results::parse_value(" 12.0 "), Some(12.0));
    assert_eq!(lab_results::parse_value("<0.5"), Some(0.5));
    assert_eq!(lab_results::parse_value(">25.0"), Some(25.0));
    assert_eq!(lab_results::parse_value("---"), None);
    assert_eq!(lab_results::parse_value("NoCt"), None);
}

#[test]
fn a_value_is_flagged_against_its_range_like_the_lab_pdf() {
    assert_eq!(lab_results::classify("25,4", Some(6.0), Some(17.0)), "H");
    assert_eq!(lab_results::classify(">25.0", Some(12.0), Some(18.0)), "H");
    assert_eq!(lab_results::classify("<0.5", Some(1.0), Some(5.0)), "L");
    assert_eq!(lab_results::classify("<0.5", Some(0.0), Some(5.0)), "U", "below 0.5 may still be in range");
    assert_eq!(lab_results::classify("3.0", Some(1.0), Some(5.0)), "N");
    assert_eq!(lab_results::classify("0.9", Some(1.0), Some(5.0)), "L");
    assert_eq!(lab_results::classify("---", Some(1.0), Some(5.0)), "U");
    assert_eq!(lab_results::classify("3.0", None, None), "U");
}

#[test]
fn exigo_values_carry_the_pdf_name_and_unit_and_the_machines_range() {
    let results = serde_json::json!({
        "ID2": "KOKO", "SNO": "53672", "DATE": "2026-07-10 14:52:11",
        "WBC": "25,4", "WBC_L": "6.0", "WBC_H": "17.0", "WBC_F": "ER",
        "HGB": ">25.0", "HGB_L": "12.0", "HGB_H": "18.0",
        "PLT": "---", "PLT_L": "200", "PLT_H": "500",
        "RBC": "7.10", "RBC_L": "5.50", "RBC_H": "8.50", "RBC_F": "L",
    });

    let values = lab_results::extract_values("exigo_eos_vet", &results, Some("Dog"));

    assert_eq!(values.iter().map(|v| v.code.as_str()).collect::<Vec<_>>(), ["PLT", "HGB", "WBC", "RBC"]);
    let wbc = value(&values, "WBC");
    assert_eq!(wbc.name, "WBC - леукоцити");
    assert_eq!(wbc.unit.as_deref(), Some("10e+9/L"));
    assert_eq!((wbc.ref_low, wbc.ref_high), (Some(6.0), Some(17.0)));
    assert_eq!(wbc.value_text, "25,4");
    assert_eq!(wbc.value_num, Some(25.4));
    assert_eq!(wbc.flag, "H");
    assert_eq!(value(&values, "HGB").flag, "H");
    assert_eq!(value(&values, "PLT").flag, "U");
    assert_eq!(value(&values, "PLT").value_num, None);
    assert_eq!(value(&values, "RBC").flag, "L", "the machine's own flag wins over the range");
    assert!(values.windows(2).all(|w| w[0].position < w[1].position));
}

#[test]
fn chemistry_uses_the_machines_range_and_falls_back_to_the_pdf_range() {
    let results = serde_json::json!({
        "ALT": "120", "ALT_unit": "U/L", "ALT_range": "10-100", "ALT_flag": "N",
        "GLU": "150",
        "Na": "150", "Na_unit": "mmol/L", "Na_range": "0-0",
        "CRE": "1,0", "CRE_unit": "mg/dL", "CRE_range": "0.5-1.8",
        "sample_id": "45512-10", "patient_name": "Rex", "PID_2": "x", "message_datetime": "20261023101500",
    });

    let values = lab_results::extract_values("mnchip_pointcare_chemistry", &results, Some("Dog"));

    assert_eq!(values.len(), 4, "{:?}", values);
    let alt = value(&values, "ALT");
    assert_eq!(alt.flag, "N", "the machine's flag wins");
    assert_eq!((alt.ref_low, alt.ref_high, alt.range_text.as_deref()), (Some(10.0), Some(100.0), Some("10-100")));
    let glu = value(&values, "GLU");
    assert_eq!((glu.unit.as_deref(), glu.ref_low, glu.ref_high), (Some("mg/dL"), Some(70.0), Some(110.0)));
    assert_eq!(glu.flag, "H");
    assert_eq!(glu.name, "GLU - гликоза");
    let na = value(&values, "Na+");
    assert_eq!((na.ref_low, na.ref_high), (Some(144.0), Some(160.0)), "a 0-0 range from the machine means none");
    assert_eq!(na.flag, "N");
    assert_eq!(value(&values, "CRE").flag, "N");
}

#[test]
fn healvet_ranges_follow_the_species_like_the_lab_pdf() {
    let results = serde_json::json!({
        "SAA": "6.0", "T4-1": "55", "Mystery": "4",
        "sample_id": "03fa", "test_datetime": "06-04-2026 11:49:53", "patient_name": "bubu", "field_12": "x",
    });

    let cat = lab_results::extract_values("healvet_hv_fia_3000", &results, Some("Мачка"));
    let dog = lab_results::extract_values("healvet_hv_fia_3000", &results, Some("Dog"));

    assert_eq!(value(&cat, "SAA").flag, "N");
    assert_eq!((value(&cat, "SAA").ref_low, value(&cat, "SAA").ref_high), (Some(0.0), Some(8.0)));
    assert_eq!(value(&dog, "SAA").flag, "H");
    assert_eq!(value(&dog, "SAA").unit.as_deref(), Some("mg/L"));
    assert_eq!(value(&dog, "SAA").name, "SAA инфек. маркер");
    assert_eq!(value(&cat, "T4-1").flag, "H");
    assert_eq!(value(&dog, "T4-1").flag, "N");
    assert_eq!(value(&dog, "Mystery").flag, "U");
    assert_eq!(dog.len(), 3, "{:?}", dog);
}

// Healvet has ranges for dogs and cats only; another animal's value was
// flagged against the dog range. Same rule as the lab PDF.
#[test]
fn healvet_values_of_other_species_have_no_range_or_flag() {
    let results = serde_json::json!({ "SAA": "6.0" });
    let rabbit = lab_results::extract_values("healvet_hv_fia_3000", &results, Some("Rabbit"));
    let saa = value(&rabbit, "SAA");
    assert_eq!(saa.name, "SAA инфек. маркер");
    assert_eq!(saa.unit.as_deref(), Some("mg/L"));
    assert_eq!((saa.ref_low, saa.ref_high, saa.range_text.as_deref()), (None, None, None));
    assert_eq!(saa.flag, "U");
}

// ---------------------------------------------------------------------------
// Rows written on attach, re-pointed on move, hidden on delete
// ---------------------------------------------------------------------------

#[tokio::test]
async fn attaching_a_result_stores_one_row_per_analyte_with_the_machines_time() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let rex = seed_patient(&db, "Rex", 1).await;
    let record = seed_record(&db, rex, "Bloods").await;
    receive(&db, dir.path(), "r1", &koko_xml()).await;

    let attachment = lab_inbox::attach_to_record(&db, dir.path(), "r1", record).await.unwrap();

    let rows = lab_results::patient_lab_results(&db, rex).await.unwrap();
    assert!(rows.len() >= 3, "{:?}", rows);
    let wbc = rows.iter().find(|r| r.code == "WBC").expect("WBC row");
    assert_eq!(wbc.attachment_id, attachment);
    assert_eq!(wbc.medical_record_id, record);
    assert_eq!(wbc.record_name.as_deref(), Some("Bloods"));
    assert_eq!(wbc.source_file_id.as_deref(), Some("r1"));
    assert_eq!(wbc.device_type, "exigo_eos_vet");
    assert_eq!(wbc.sample_at, "2026-07-10T14:52:11");
    assert_eq!(wbc.value_text, "10.4");
    assert_eq!(wbc.flag, "N");
}

#[tokio::test]
async fn indexing_an_attachment_twice_keeps_one_set_of_rows() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let rex = seed_patient(&db, "Rex", 1).await;
    let record = seed_record(&db, rex, "Bloods").await;
    let attachment = upload(&db, dir.path(), record, "stored-1", "exigo_eos_vet", &koko_xml()).await;

    let first = lab_results::index_attachment(&db, dir.path(), attachment).await.unwrap();
    let second = lab_results::index_attachment(&db, dir.path(), attachment).await.unwrap();

    assert!(first > 0);
    assert_eq!(first, second);
    assert_eq!(count(&db, "SELECT COUNT(*) FROM lab_results").await, first as i64);
}

#[tokio::test]
async fn moving_a_result_re_points_its_rows_to_the_chosen_record() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let max = seed_patient(&db, "Max", 1).await;
    let koko = seed_patient(&db, "Koko", 1).await;
    let wrong = seed_record(&db, max, "Max consult").await;
    let right = seed_record(&db, koko, "Koko consult").await;
    receive(&db, dir.path(), "r1", &koko_xml()).await;
    let attachment = lab_inbox::attach_to_record(&db, dir.path(), "r1", wrong).await.unwrap();
    let before = lab_results::patient_lab_results(&db, max).await.unwrap().len();

    let outcome = lab_inbox::move_result(&broken_env(&dir), &db, attachment, right, None).await.unwrap();

    assert!(lab_results::patient_lab_results(&db, max).await.unwrap().is_empty());
    let moved = lab_results::patient_lab_results(&db, koko).await.unwrap();
    assert_eq!(moved.len(), before);
    assert!(moved.iter().all(|r| r.attachment_id == outcome.attachment_id && r.medical_record_id == right));
    assert_eq!(count(&db, "SELECT COUNT(*) FROM lab_results").await, before as i64, "moved, not copied");
}

#[tokio::test]
async fn deleting_the_attachment_hides_its_values() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let rex = seed_patient(&db, "Rex", 1).await;
    let record = seed_record(&db, rex, "Bloods").await;
    receive(&db, dir.path(), "r1", &koko_xml()).await;
    let attachment = lab_inbox::attach_to_record(&db, dir.path(), "r1", record).await.unwrap();
    assert!(!lab_results::record_lab_values(&db, record).await.unwrap().is_empty());

    lab_inbox::delete_attachment(&db, attachment).await.unwrap();

    assert!(lab_results::patient_lab_results(&db, rex).await.unwrap().is_empty());
    assert!(lab_results::record_lab_values(&db, record).await.unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// Backfill of results attached before this table existed
// ---------------------------------------------------------------------------

#[tokio::test]
async fn backfill_reads_older_attachments_once_and_skips_unreadable_ones() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let cat = seed_patient(&db, "Mici", 2).await;
    let record = seed_record(&db, cat, "Check-up").await;
    let healvet = br#"{"SAA": "6.0", "cCRP": "12,5", "patient_name": "Mici"}"#;
    upload(&db, dir.path(), record, "stored-hv", "healvet_hv_fia_3000", healvet).await;
    upload(&db, dir.path(), record, "stored-bad", "exigo_eos_vet", b"not xml at all").await;
    upload(&db, dir.path(), record, "stored-gone", "exigo_eos_vet", b"x").await;
    std::fs::remove_file(dir.path().join("stored-gone")).unwrap();

    let first = lab_results::backfill(&db, dir.path()).await.unwrap();
    let second = lab_results::backfill(&db, dir.path()).await.unwrap();

    assert_eq!(first, lab_results::BackfillReport { indexed: 1, failed: 2 });
    assert_eq!(second, lab_results::BackfillReport { indexed: 0, failed: 0 });
    let rows = lab_results::patient_lab_results(&db, cat).await.unwrap();
    assert_eq!(rows.len(), 2);
    let saa = rows.iter().find(|r| r.code == "SAA").unwrap();
    assert_eq!(saa.flag, "N", "cat range 0–8");
    assert!(saa.sample_at.starts_with("2026-10-20"), "no machine time: the attach time, got {}", saa.sample_at);
    assert_eq!(rows.iter().find(|r| r.code == "cCRP").unwrap().value_num, Some(12.5));
}

// ---------------------------------------------------------------------------
// Reading them back
// ---------------------------------------------------------------------------

#[tokio::test]
async fn patient_values_come_newest_sample_first() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let rex = seed_patient(&db, "Rex", 1).await;
    let record = seed_record(&db, rex, "Bloods").await;
    let samples = split_exigo_samples(DAILY);
    upload(&db, dir.path(), record, "s1", "exigo_eos_vet", &samples[0].xml).await;
    upload(&db, dir.path(), record, "s2", "exigo_eos_vet", &samples[1].xml).await;
    lab_results::backfill(&db, dir.path()).await.unwrap();

    let rows = lab_results::patient_lab_results(&db, rex).await.unwrap();

    assert_eq!(rows.first().unwrap().sample_at, "2026-07-10T15:36:47");
    assert_eq!(rows.last().unwrap().sample_at, "2026-07-10T14:52:11");
}

#[tokio::test]
async fn a_records_values_carry_the_previous_value_of_the_same_analyte() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let rex = seed_patient(&db, "Rex", 1).await;
    let last_week = seed_record(&db, rex, "Last week").await;
    let today = seed_record(&db, rex, "Today").await;
    let samples = split_exigo_samples(DAILY);
    upload(&db, dir.path(), last_week, "s1", "exigo_eos_vet", &samples[0].xml).await;
    upload(&db, dir.path(), today, "s2", "exigo_eos_vet", &samples[1].xml).await;
    lab_results::backfill(&db, dir.path()).await.unwrap();

    let values = lab_results::record_lab_values(&db, today).await.unwrap();
    let older = lab_results::record_lab_values(&db, last_week).await.unwrap();

    let wbc = values.iter().find(|v| v.value.code == "WBC").unwrap();
    assert_eq!(wbc.value.value_text, "8.9");
    let previous = wbc.previous.as_ref().expect("previous WBC");
    assert_eq!(previous.value_text, "10.4");
    assert_eq!(previous.sample_at, "2026-07-10T14:52:11");
    assert!(older.iter().all(|v| v.previous.is_none()));
}
