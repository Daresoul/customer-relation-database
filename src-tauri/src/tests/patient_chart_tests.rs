//! Patient chart: neuter status, alerts, deceased / inactive status and the
//! weight log.

use crate::models::dto::{CreatePatientDto, MaybeNull, UpdatePatientDto};
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;
use chrono::{Duration, Local, NaiveDate};
use sea_orm::{ConnectionTrait, DbBackend, Statement};

fn day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

fn create_dto(name: &str) -> CreatePatientDto {
    CreatePatientDto {
        name: Some(name.to_string()),
        species_id: Some(1),
        breed_id: None,
        gender: None,
        date_of_birth: None,
        color: None,
        weight: None,
        microchip_id: None,
        medical_notes: None,
        household_id: None,
    }
}

fn empty_update() -> UpdatePatientDto {
    UpdatePatientDto {
        name: None,
        species_id: MaybeNull::Undefined,
        breed_id: MaybeNull::Undefined,
        gender: MaybeNull::Undefined,
        date_of_birth: MaybeNull::Undefined,
        color: MaybeNull::Undefined,
        weight: MaybeNull::Undefined,
        microchip_id: MaybeNull::Undefined,
        medical_notes: MaybeNull::Undefined,
        is_active: None,
        neutered: MaybeNull::Undefined,
    }
}

async fn pet(db: &sea_orm::DatabaseConnection, name: &str) -> i64 {
    PatientService::create(db, create_dto(name)).await.unwrap().id
}

async fn stored_weight(db: &sea_orm::DatabaseConnection, id: i64) -> Option<f64> {
    PatientService::get_by_id(db, id).await.unwrap().unwrap().weight
}

// ---------------------------------------------------------------------------
// neuter status
// ---------------------------------------------------------------------------

#[tokio::test]
async fn neuter_status_is_unknown_until_set() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    assert_eq!(PatientService::get_by_id(&db, id).await.unwrap().unwrap().neutered, None);
}

#[tokio::test]
async fn neuter_status_can_be_set_and_cleared() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;

    let yes = PatientService::update(&db, id, UpdatePatientDto { neutered: MaybeNull::Value(true), ..empty_update() })
        .await.unwrap().unwrap();
    assert_eq!(yes.neutered, Some(true));

    let no = PatientService::update(&db, id, UpdatePatientDto { neutered: MaybeNull::Value(false), ..empty_update() })
        .await.unwrap().unwrap();
    assert_eq!(no.neutered, Some(false));

    let unknown = PatientService::update(&db, id, UpdatePatientDto { neutered: MaybeNull::Null, ..empty_update() })
        .await.unwrap().unwrap();
    assert_eq!(unknown.neutered, None);
}

// ---------------------------------------------------------------------------
// alerts
// ---------------------------------------------------------------------------

#[tokio::test]
async fn an_alert_is_stored_with_its_type_and_note_and_shown_on_the_patient() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;

    let alert = PatientService::add_alert(&db, id, "allergy", Some("  Penicillin ".into())).await.unwrap();
    assert_eq!(alert.alert_type, "allergy");
    assert_eq!(alert.note.as_deref(), Some("Penicillin"));

    let patient = PatientService::get_by_id(&db, id).await.unwrap().unwrap();
    assert_eq!(patient.alerts.len(), 1);
    assert_eq!(patient.alerts[0].alert_type, "allergy");
}

#[tokio::test]
async fn an_unknown_alert_type_is_refused() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    let err = PatientService::add_alert(&db, id, "spicy", None).await.unwrap_err();
    assert!(err.starts_with("INVALID_ALERT_TYPE"), "{}", err);
}

#[tokio::test]
async fn an_alert_note_over_200_characters_is_refused() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    let err = PatientService::add_alert(&db, id, "other", Some("ж".repeat(201))).await.unwrap_err();
    assert!(err.starts_with("ALERT_NOTE_TOO_LONG"), "{}", err);
    assert!(PatientService::add_alert(&db, id, "other", Some("ж".repeat(200))).await.is_ok());
}

#[tokio::test]
async fn an_alert_can_be_changed_and_removed() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    let alert = PatientService::add_alert(&db, id, "other", None).await.unwrap();

    let changed = PatientService::update_alert(&db, alert.id, "aggressive", Some("Bites".into())).await.unwrap();
    assert_eq!(changed.alert_type, "aggressive");
    assert_eq!(changed.note.as_deref(), Some("Bites"));

    assert!(PatientService::delete_alert(&db, alert.id).await.unwrap());
    assert!(PatientService::get_by_id(&db, id).await.unwrap().unwrap().alerts.is_empty());
}

#[tokio::test]
async fn the_patient_list_carries_each_patients_own_alerts() {
    let db = create_test_db_with_migrations().await;
    let rex = pet(&db, "Rex").await;
    let tom = pet(&db, "Tom").await;
    PatientService::add_alert(&db, rex, "aggressive", None).await.unwrap();

    let all = PatientService::get_all(&db).await.unwrap();
    let rex_row = all.iter().find(|p| p.id == rex).unwrap();
    let tom_row = all.iter().find(|p| p.id == tom).unwrap();
    assert_eq!(rex_row.alerts.len(), 1);
    assert!(tom_row.alerts.is_empty());
}

// ---------------------------------------------------------------------------
// deceased / inactive
// ---------------------------------------------------------------------------

#[tokio::test]
async fn marking_deceased_keeps_the_chart_and_records_the_date_and_note() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;

    let p = PatientService::mark_deceased(&db, id, day("2026-01-05"), Some("Old age".into()))
        .await.unwrap().unwrap();

    assert_eq!(p.deceased_at, Some(day("2026-01-05")));
    assert_eq!(p.deceased_note.as_deref(), Some("Old age"));
    assert!(!p.is_active);
}

#[tokio::test]
async fn a_date_of_death_in_the_future_is_refused() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    let tomorrow = Local::now().date_naive() + Duration::days(1);

    let err = PatientService::mark_deceased(&db, id, tomorrow, None).await.unwrap_err();

    assert!(err.starts_with("DECEASED_DATE_IN_FUTURE"), "{}", err);
}

#[tokio::test]
async fn marking_inactive_keeps_a_reason_and_no_date_of_death() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;

    let p = PatientService::mark_inactive(&db, id, Some("Moved to Ohrid".into())).await.unwrap().unwrap();

    assert!(!p.is_active);
    assert_eq!(p.inactive_reason.as_deref(), Some("Moved to Ohrid"));
    assert_eq!(p.deceased_at, None);
}

#[tokio::test]
async fn reactivating_clears_the_status() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    PatientService::mark_deceased(&db, id, day("2026-01-05"), Some("x".into())).await.unwrap();

    let p = PatientService::reactivate(&db, id).await.unwrap().unwrap();

    assert!(p.is_active);
    assert_eq!(p.deceased_at, None);
    assert_eq!(p.deceased_note, None);
    assert_eq!(p.inactive_reason, None);
}

#[tokio::test]
async fn reactivating_is_refused_when_its_chip_now_belongs_to_another_active_patient() {
    let db = create_test_db_with_migrations().await;
    let old = PatientService::create(&db, CreatePatientDto { microchip_id: Some("807010000007678".into()), ..create_dto("Old") })
        .await.unwrap().id;
    PatientService::mark_inactive(&db, old, None).await.unwrap();
    PatientService::create(&db, CreatePatientDto { microchip_id: Some("807010000007678".into()), ..create_dto("New") })
        .await.unwrap();

    let err = PatientService::reactivate(&db, old).await.unwrap_err();

    assert!(err.contains("already registered"), "{}", err);
}

#[tokio::test]
async fn search_hides_inactive_and_deceased_patients_unless_asked() {
    let db = create_test_db_with_migrations().await;
    pet(&db, "Rex").await;
    let gone = pet(&db, "Rexie").await;
    let moved = pet(&db, "Rexo").await;
    PatientService::mark_deceased(&db, gone, day("2026-01-05"), None).await.unwrap();
    PatientService::mark_inactive(&db, moved, None).await.unwrap();

    let default = PatientService::search(&db, "rex").await.unwrap();
    let all = PatientService::search_including_inactive(&db, "rex", true).await.unwrap();

    assert_eq!(default.iter().map(|p| p.name.clone().unwrap()).collect::<Vec<_>>(), vec!["Rex"]);
    assert_eq!(all.len(), 3);
}

#[tokio::test]
async fn a_deceased_patient_cannot_be_booked() {
    use crate::models::CreateAppointmentInput;
    use crate::services::appointments::AppointmentService;
    use chrono::{TimeZone, Utc};

    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    PatientService::mark_deceased(&db, id, day("2026-01-05"), None).await.unwrap();

    let err = AppointmentService::create_appointment(
        &db,
        CreateAppointmentInput {
            patient_id: id,
            title: "Check-up".into(),
            description: None,
            start_time: Utc.with_ymd_and_hms(2030, 1, 10, 9, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2030, 1, 10, 9, 30, 0).unwrap(),
            room_id: None,
        },
        "test".into(),
    )
    .await
    .unwrap_err();

    assert!(err.starts_with("PATIENT_DECEASED"), "{}", err);
}

#[tokio::test]
async fn household_pets_report_their_status() {
    let db = create_test_db_with_migrations().await;
    db.execute_unprepared("INSERT INTO households (id, household_name) VALUES (7, 'Petrovski')").await.unwrap();
    let alive = PatientService::create(&db, CreatePatientDto { household_id: Some(7), ..create_dto("Alive") }).await.unwrap().id;
    let gone = PatientService::create(&db, CreatePatientDto { household_id: Some(7), ..create_dto("Gone") }).await.unwrap().id;
    let moved = PatientService::create(&db, CreatePatientDto { household_id: Some(7), ..create_dto("Moved") }).await.unwrap().id;
    PatientService::mark_deceased(&db, gone, day("2026-01-05"), None).await.unwrap();
    PatientService::mark_inactive(&db, moved, None).await.unwrap();

    let pets = crate::commands::household::household_patients_json(&db, 7).await.unwrap();
    let status = |id: i64| pets.iter().find(|p| p["id"] == id).unwrap()["status"].clone();

    assert_eq!(status(alive), "active");
    assert_eq!(status(gone), "deceased");
    assert_eq!(status(moved), "inactive");
    assert_eq!(pets.iter().find(|p| p["id"] == gone).unwrap()["deceasedAt"], "2026-01-05");
}

// ---------------------------------------------------------------------------
// weight log
// ---------------------------------------------------------------------------

#[tokio::test]
async fn adding_a_weight_logs_it_and_makes_it_the_patients_weight() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;

    let entry = PatientService::add_weight(&db, id, 12.4, day("2026-03-03"), None).await.unwrap();

    assert_eq!(entry.weight, 12.4);
    assert_eq!(entry.measured_on, day("2026-03-03"));
    let p = PatientService::get_by_id(&db, id).await.unwrap().unwrap();
    assert_eq!(p.weight, Some(12.4));
    assert_eq!(p.last_weight_at, Some(day("2026-03-03")));
}

#[tokio::test]
async fn an_older_weight_does_not_replace_the_latest() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    PatientService::add_weight(&db, id, 12.4, day("2026-03-03"), None).await.unwrap();

    PatientService::add_weight(&db, id, 10.0, day("2025-11-01"), None).await.unwrap();

    assert_eq!(stored_weight(&db, id).await, Some(12.4));
}

#[tokio::test]
async fn the_log_lists_newest_first() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    PatientService::add_weight(&db, id, 10.0, day("2025-11-01"), None).await.unwrap();
    PatientService::add_weight(&db, id, 12.4, day("2026-03-03"), None).await.unwrap();
    PatientService::add_weight(&db, id, 11.0, day("2026-01-10"), None).await.unwrap();

    let log = PatientService::list_weights(&db, id).await.unwrap();

    assert_eq!(log.iter().map(|w| w.weight).collect::<Vec<_>>(), vec![12.4, 11.0, 10.0]);
}

#[tokio::test]
async fn deleting_the_latest_weight_falls_back_to_the_one_before() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    PatientService::add_weight(&db, id, 10.0, day("2025-11-01"), None).await.unwrap();
    let latest = PatientService::add_weight(&db, id, 12.4, day("2026-03-03"), None).await.unwrap();

    assert!(PatientService::delete_weight(&db, latest.id).await.unwrap());
    assert_eq!(stored_weight(&db, id).await, Some(10.0));

    let only = PatientService::list_weights(&db, id).await.unwrap()[0].id;
    PatientService::delete_weight(&db, only).await.unwrap();
    assert_eq!(stored_weight(&db, id).await, None);
}

#[tokio::test]
async fn a_weight_of_zero_or_less_is_refused() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    let err = PatientService::add_weight(&db, id, 0.0, day("2026-03-03"), None).await.unwrap_err();
    assert!(err.starts_with("INVALID_WEIGHT"), "{}", err);
}

#[tokio::test]
async fn a_weight_can_point_at_the_record_it_was_taken_in() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (id, patient_id, record_type, name, description) VALUES (55, ?, 'procedure', 'Consult', 'x')",
        vec![id.into()],
    ))
    .await
    .unwrap();

    let entry = PatientService::add_weight(&db, id, 8.0, day("2026-03-03"), Some(55)).await.unwrap();

    assert_eq!(entry.medical_record_id, Some(55));
}

#[tokio::test]
async fn creating_a_patient_with_a_weight_logs_it_today() {
    let db = create_test_db_with_migrations().await;
    let id = PatientService::create(&db, CreatePatientDto { weight: Some(4.2), ..create_dto("Tom") }).await.unwrap().id;

    let log = PatientService::list_weights(&db, id).await.unwrap();

    assert_eq!(log.len(), 1);
    assert_eq!(log[0].weight, 4.2);
    assert_eq!(log[0].measured_on, Local::now().date_naive());
}

#[tokio::test]
async fn setting_the_weight_field_logs_it_today() {
    let db = create_test_db_with_migrations().await;
    let id = pet(&db, "Rex").await;

    PatientService::update(&db, id, UpdatePatientDto { weight: MaybeNull::Value(9.5), ..empty_update() }).await.unwrap();

    let log = PatientService::list_weights(&db, id).await.unwrap();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].weight, 9.5);
}

#[tokio::test]
async fn the_migration_moves_an_existing_weight_into_the_log_at_the_patients_last_update() {
    let db = create_test_db_with_migrations().await;
    db.execute_unprepared(
        "INSERT INTO patients (id, name, species_id, weight, is_active, created_at, updated_at) \
         VALUES (900, 'Old', 1, 7.25, 1, '2024-05-01 10:00:00', '2025-02-14 08:30:00')",
    )
    .await
    .unwrap();
    db.execute_unprepared("DELETE FROM patient_weights").await.unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM migrations WHERE filename = ?",
        vec![crate::database::migrations::WEIGHT_LOG_MIGRATION.into()],
    ))
    .await
    .unwrap();

    crate::database::migrations::run_migrations(db.get_sqlite_connection_pool()).await.unwrap();

    let log = PatientService::list_weights(&db, 900).await.unwrap();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].weight, 7.25);
    assert_eq!(log[0].measured_on, day("2025-02-14"));
}
