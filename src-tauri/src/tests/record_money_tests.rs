//! Medical record money paths: invoice number and date, clearing values,
//! one transaction for a record and its line items, PDF replacement.

use crate::models::dto::CreatePatientDto;
use crate::services::medical_record::MedicalRecordService;
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn seed_patient(db: &DatabaseConnection) -> i64 {
    PatientService::create(
        db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
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

async fn insert_record_with_invoice(db: &DatabaseConnection, patient_id: i64, invoice: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records \
         (patient_id, record_type, name, description, discount_percent, manual_total, invoice_number, \
          is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', 'Visit', 'Notes', 10.0, 500.0, ?, 0, 1, \
                 '2026-10-20T10:00:00+00:00', '2026-10-20T10:00:00+00:00')",
        [patient_id.into(), invoice.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

// ---------------------------------------------------------------------------
// D1: every read carries the invoice number
// ---------------------------------------------------------------------------

#[tokio::test]
async fn record_detail_carries_invoice_number() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let id = insert_record_with_invoice(&db, patient_id, "007/2026").await;

    let detail = MedicalRecordService::get_medical_record(&db, id, false).await.unwrap();

    assert_eq!(detail.record.invoice_number.as_deref(), Some("007/2026"));
}

#[tokio::test]
async fn record_list_and_search_carry_invoice_number_and_money_fields() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    insert_record_with_invoice(&db, patient_id, "008/2026").await;

    let list = MedicalRecordService::get_medical_records(&db, patient_id, None, None).await.unwrap();
    let r = &list.records[0];
    assert_eq!(r.invoice_number.as_deref(), Some("008/2026"));
    assert_eq!(r.discount_percent, Some(10.0));
    assert_eq!(r.manual_total, Some(500.0));

    let found = MedicalRecordService::search_medical_records(&db, patient_id, "visit", false).await.unwrap();
    assert_eq!(found[0].invoice_number.as_deref(), Some("008/2026"));
    assert_eq!(found[0].discount_percent, Some(10.0));
}

#[tokio::test]
async fn record_at_version_carries_invoice_number() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let id = insert_record_with_invoice(&db, patient_id, "009/2026").await;

    let r = MedicalRecordService::get_record_at_version(&db, id, 1).await.unwrap();

    assert_eq!(r.invoice_number.as_deref(), Some("009/2026"));
}
