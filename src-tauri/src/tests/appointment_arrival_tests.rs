//! Appointment arrival statuses (checked in, no-show), edits that used to be
//! dropped (patient change, clearing the room), the record link, the
//! same-patient double-booking check and the Google state on the detail.

use crate::models::dto::{CreatePatientDto, MaybeNull};
use crate::models::{
    AppointmentFilter, AppointmentStatus, ConflictCheckInput, CreateAppointmentInput,
    UpdateAppointmentInput,
};
use crate::services::appointments::AppointmentService;
use crate::services::patient::PatientService;
use crate::test_utils::{create_test_db_with_migrations, create_test_room};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde_json::json;

fn at(hour: u32, minute: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2030, 1, 10, hour, minute, 0).unwrap()
}

async fn pet(db: &DatabaseConnection, name: &str) -> i64 {
    PatientService::create(
        db,
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
        },
    )
    .await
    .unwrap()
    .id
}

async fn book(db: &DatabaseConnection, patient_id: i64, room_id: Option<i64>, hour: u32) -> i64 {
    AppointmentService::create_appointment(
        db,
        CreateAppointmentInput {
            patient_id,
            title: "Vaccination".into(),
            description: None,
            start_time: at(hour, 0),
            end_time: at(hour, 30),
            room_id,
        },
        "test".into(),
    )
    .await
    .unwrap()
    .id
}

fn set_status(status: AppointmentStatus) -> UpdateAppointmentInput {
    UpdateAppointmentInput { status: Some(status), ..Default::default() }
}

async fn update(db: &DatabaseConnection, id: i64, input: UpdateAppointmentInput) -> crate::models::Appointment {
    AppointmentService::update_appointment(db, id, input, "test".into()).await.unwrap()
}

fn filter(status: Option<AppointmentStatus>) -> AppointmentFilter {
    AppointmentFilter { status, include_cancelled: Some(true), ..Default::default() }
}

async fn ids_with(db: &DatabaseConnection, f: AppointmentFilter) -> Vec<i64> {
    AppointmentService::get_appointments(db, f, 100, 0)
        .await
        .unwrap()
        .appointments
        .iter()
        .map(|a| a.id)
        .collect()
}

// ---------------------------------------------------------------------------
// arrival statuses
// ---------------------------------------------------------------------------

#[tokio::test]
async fn checking_in_records_the_arrival_time() {
    let db = create_test_db_with_migrations().await;
    let id = book(&db, pet(&db, "Bella").await, None, 9).await;

    let before = Utc::now();
    let a = update(&db, id, set_status(AppointmentStatus::CheckedIn)).await;

    assert_eq!(a.status, AppointmentStatus::CheckedIn);
    let arrived = a.checked_in_at.expect("arrival time");
    assert!(arrived >= before - chrono::Duration::seconds(1));
}

#[tokio::test]
async fn starting_the_consult_keeps_the_arrival_time() {
    let db = create_test_db_with_migrations().await;
    let id = book(&db, pet(&db, "Bella").await, None, 9).await;
    let arrived = update(&db, id, set_status(AppointmentStatus::CheckedIn)).await.checked_in_at;

    let a = update(&db, id, set_status(AppointmentStatus::InProgress)).await;

    assert_eq!(a.status, AppointmentStatus::InProgress);
    assert_eq!(a.checked_in_at, arrived);
}

#[tokio::test]
async fn checking_in_twice_keeps_the_first_arrival_time() {
    let db = create_test_db_with_migrations().await;
    let id = book(&db, pet(&db, "Bella").await, None, 9).await;
    let first = update(&db, id, set_status(AppointmentStatus::CheckedIn)).await.checked_in_at;

    let again = update(&db, id, set_status(AppointmentStatus::CheckedIn)).await.checked_in_at;

    assert_eq!(again, first);
}

#[tokio::test]
async fn back_to_scheduled_clears_the_arrival() {
    let db = create_test_db_with_migrations().await;
    let id = book(&db, pet(&db, "Bella").await, None, 9).await;
    update(&db, id, set_status(AppointmentStatus::CheckedIn)).await;

    let a = update(&db, id, set_status(AppointmentStatus::Scheduled)).await;

    assert_eq!(a.status, AppointmentStatus::Scheduled);
    assert_eq!(a.checked_in_at, None);
}

#[tokio::test]
async fn a_no_show_reads_back_as_no_show_and_frees_the_room() {
    let db = create_test_db_with_migrations().await;
    let room = create_test_room(&db, "Exam A").await;
    let id = book(&db, pet(&db, "Bella").await, Some(room), 9).await;

    let a = update(&db, id, set_status(AppointmentStatus::NoShow)).await;
    let conflicts = AppointmentService::check_conflicts(
        &db,
        ConflictCheckInput {
            start_time: at(9, 0),
            end_time: at(9, 30),
            room_id: Some(room),
            exclude_appointment_id: None,
            patient_id: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(a.status, AppointmentStatus::NoShow);
    assert!(conflicts.conflicts.is_empty());
}

#[tokio::test]
async fn cancelling_a_no_show_makes_it_a_plain_cancellation() {
    let db = create_test_db_with_migrations().await;
    let id = book(&db, pet(&db, "Bella").await, None, 9).await;
    update(&db, id, set_status(AppointmentStatus::NoShow)).await;

    let a = update(&db, id, set_status(AppointmentStatus::Cancelled)).await;

    assert_eq!(a.status, AppointmentStatus::Cancelled);
}

#[tokio::test]
async fn the_status_filter_tells_the_arrival_statuses_apart() {
    let db = create_test_db_with_migrations().await;
    let p = pet(&db, "Bella").await;
    let waiting = book(&db, p, None, 9).await;
    let booked = book(&db, p, None, 10).await;
    let missed = book(&db, p, None, 11).await;
    let cancelled = book(&db, p, None, 12).await;
    update(&db, waiting, set_status(AppointmentStatus::CheckedIn)).await;
    update(&db, missed, set_status(AppointmentStatus::NoShow)).await;
    update(&db, cancelled, set_status(AppointmentStatus::Cancelled)).await;

    assert_eq!(ids_with(&db, filter(Some(AppointmentStatus::CheckedIn))).await, vec![waiting]);
    assert_eq!(ids_with(&db, filter(Some(AppointmentStatus::Scheduled))).await, vec![booked]);
    assert_eq!(ids_with(&db, filter(Some(AppointmentStatus::NoShow))).await, vec![missed]);
    assert_eq!(ids_with(&db, filter(Some(AppointmentStatus::Cancelled))).await, vec![cancelled]);
    // Without include_cancelled, both cancelled and no-show stay out.
    let live = ids_with(&db, AppointmentFilter::default()).await;
    assert_eq!(live, vec![waiting, booked]);
}

// ---------------------------------------------------------------------------
// edits that used to be dropped
// ---------------------------------------------------------------------------

#[tokio::test]
async fn changing_the_patient_on_edit_is_saved() {
    let db = create_test_db_with_migrations().await;
    let bella = pet(&db, "Bella").await;
    let max = pet(&db, "Max").await;
    let id = book(&db, bella, None, 9).await;

    let a = update(&db, id, UpdateAppointmentInput { patient_id: Some(max), ..Default::default() }).await;

    assert_eq!(a.patient_id, max);
    assert_eq!(a.patient_name.as_deref(), Some("Max"));
}

#[tokio::test]
async fn moving_an_appointment_to_a_deceased_patient_is_refused() {
    let db = create_test_db_with_migrations().await;
    let bella = pet(&db, "Bella").await;
    let gone = pet(&db, "Gone").await;
    PatientService::mark_deceased(&db, gone, NaiveDate::from_ymd_opt(2026, 1, 5).unwrap(), None)
        .await
        .unwrap();
    let id = book(&db, bella, None, 9).await;

    let err = AppointmentService::update_appointment(
        &db,
        id,
        UpdateAppointmentInput { patient_id: Some(gone), ..Default::default() },
        "test".into(),
    )
    .await
    .unwrap_err();

    assert!(err.starts_with("PATIENT_DECEASED"), "{}", err);
}

#[tokio::test]
async fn the_room_can_be_cleared_and_is_kept_when_left_out() {
    let db = create_test_db_with_migrations().await;
    let room = create_test_room(&db, "Exam A").await;
    let id = book(&db, pet(&db, "Bella").await, Some(room), 9).await;

    let kept = update(&db, id, UpdateAppointmentInput { title: Some("Booster".into()), ..Default::default() }).await;
    let cleared = update(&db, id, UpdateAppointmentInput { room_id: MaybeNull::Null, ..Default::default() }).await;

    assert_eq!(kept.room_id, Some(room));
    assert_eq!(cleared.room_id, None);
}

#[test]
fn a_null_room_from_the_frontend_means_clear_and_a_missing_one_means_keep() {
    let cleared: UpdateAppointmentInput = serde_json::from_value(json!({ "room_id": null })).unwrap();
    let kept: UpdateAppointmentInput = serde_json::from_value(json!({ "title": "x" })).unwrap();
    let set: UpdateAppointmentInput = serde_json::from_value(json!({ "room_id": 4 })).unwrap();

    assert!(matches!(cleared.room_id, MaybeNull::Null));
    assert!(matches!(kept.room_id, MaybeNull::Undefined));
    assert!(matches!(set.room_id, MaybeNull::Value(4)));
}

#[test]
fn the_arrival_statuses_travel_as_snake_case() {
    let checked: UpdateAppointmentInput = serde_json::from_value(json!({ "status": "checked_in" })).unwrap();
    let missed: UpdateAppointmentInput = serde_json::from_value(json!({ "status": "no_show" })).unwrap();

    assert_eq!(checked.status, Some(AppointmentStatus::CheckedIn));
    assert_eq!(missed.status, Some(AppointmentStatus::NoShow));
    assert_eq!(serde_json::to_value(AppointmentStatus::NoShow).unwrap(), json!("no_show"));
}

// ---------------------------------------------------------------------------
// record link
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_record_started_from_the_appointment_is_linked_to_it() {
    let db = create_test_db_with_migrations().await;
    let p = pet(&db, "Bella").await;
    let id = book(&db, p, None, 9).await;
    let record = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_records (patient_id, record_type, name, description) VALUES (?, 'note', 'Consult', '')",
            [p.into()],
        ))
        .await
        .unwrap()
        .last_insert_id() as i64;

    let a = update(&db, id, UpdateAppointmentInput { medical_record_id: Some(record), ..Default::default() }).await;

    assert_eq!(a.medical_record_id, Some(record));
    let detail = AppointmentService::get_appointment_by_id(&db, id).await.unwrap();
    assert_eq!(detail.appointment.medical_record_id, Some(record));
}

// ---------------------------------------------------------------------------
// same-patient double booking
// ---------------------------------------------------------------------------

#[tokio::test]
async fn the_conflict_check_lists_the_same_patient_booked_at_the_same_time_in_any_room() {
    let db = create_test_db_with_migrations().await;
    let room_a = create_test_room(&db, "Exam A").await;
    let bella = pet(&db, "Bella").await;
    let max = pet(&db, "Max").await;
    let elsewhere = book(&db, bella, Some(room_a), 9).await;
    let _no_room = book(&db, max, None, 9).await;

    let check = AppointmentService::check_conflicts(
        &db,
        ConflictCheckInput {
            start_time: at(9, 15),
            end_time: at(9, 45),
            room_id: None,
            exclude_appointment_id: None,
            patient_id: Some(bella),
        },
    )
    .await
    .unwrap();

    assert_eq!(check.patient_conflicts.iter().map(|a| a.id).collect::<Vec<_>>(), vec![elsewhere]);
}

#[tokio::test]
async fn the_appointment_being_edited_is_not_its_own_double_booking() {
    let db = create_test_db_with_migrations().await;
    let bella = pet(&db, "Bella").await;
    let id = book(&db, bella, None, 9).await;

    let check = AppointmentService::check_conflicts(
        &db,
        ConflictCheckInput {
            start_time: at(9, 0),
            end_time: at(9, 30),
            room_id: None,
            exclude_appointment_id: Some(id),
            patient_id: Some(bella),
        },
    )
    .await
    .unwrap();

    assert!(check.patient_conflicts.is_empty());
}

// ---------------------------------------------------------------------------
// Google state on the detail
// ---------------------------------------------------------------------------

async fn google(db: &DatabaseConnection, enabled: bool, needs_reauth: bool) {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings SET access_token = 'tok', calendar_id = 'cal', sync_enabled = ?, needs_reauth = ? WHERE user_id = 'default'",
        [enabled.into(), needs_reauth.into()],
    ))
    .await
    .unwrap();
}

async fn google_state(db: &DatabaseConnection, id: i64) -> String {
    AppointmentService::get_appointment_by_id(db, id).await.unwrap().google_sync_state
}

#[tokio::test]
async fn the_detail_says_whether_the_appointment_is_on_google() {
    let db = create_test_db_with_migrations().await;
    let id = book(&db, pet(&db, "Bella").await, None, 9).await;

    assert_eq!(google_state(&db, id).await, "off");

    google(&db, true, false).await;
    assert_eq!(google_state(&db, id).await, "not_synced");

    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id, last_synced_at) VALUES (?, 'ev1', 'cal', '2030-01-09T10:00:00Z')",
        [id.into()],
    ))
    .await
    .unwrap();
    assert_eq!(google_state(&db, id).await, "synced");
    let detail = AppointmentService::get_appointment_by_id(&db, id).await.unwrap();
    assert!(detail.google_synced_at.is_some());

    google(&db, true, true).await;
    assert_eq!(google_state(&db, id).await, "reconnect");
}
