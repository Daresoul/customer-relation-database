//! Record templates that fill a whole record (text, prescription, price-list
//! lines, diagnoses, record type), "Copy from last record", and which
//! attachments a user may delete.

use std::sync::Arc;

use crate::models::diagnosis::CreateDiagnosisInput;
use crate::models::dto::{CreatePatientDto, MaybeNull};
use crate::models::line_item::{CreateLineItemInput, CreateLineItemTemplateInput, UpdateLineItemTemplateInput};
use crate::models::medical::{
    CreateMedicalRecordInput, CreateRecordTemplateInput, RecordTemplateLineItemInput, UpdateRecordTemplateInput,
};
use crate::services::diagnosis::DiagnosisService;
use crate::services::file_storage::FileStorageService;
use crate::services::line_item::LineItemService;
use crate::services::medical_record::MedicalRecordService;
use crate::services::patient::PatientService;
use crate::services::record_template::RecordTemplateService;
use crate::services::settings::SettingsService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn rate_id(db: &DatabaseConnection, name: &str) -> i64 {
    SettingsService::list_tax_rates(db, false)
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.name == name)
        .unwrap()
        .id
}

async fn price_item(db: &DatabaseConnection, name: &str, price: f64, rate: Option<i64>) -> i64 {
    LineItemService::create_template(
        db,
        CreateLineItemTemplateInput {
            name: name.to_string(),
            description: None,
            default_price: price,
            currency_id: 1,
            default_tax_rate_id: rate,
        },
    )
    .await
    .unwrap()
    .id
}

async fn diagnosis(db: &DatabaseConnection, name: &str) -> i64 {
    DiagnosisService::create(
        &Arc::new(db.clone()),
        CreateDiagnosisInput { name: name.to_string(), description: None, color: None },
    )
    .await
    .unwrap()
    .id
}

fn template_input(record_type: &str, title: &str) -> CreateRecordTemplateInput {
    CreateRecordTemplateInput {
        record_type: record_type.to_string(),
        title: title.to_string(),
        description: "Вакцинација: општ преглед, температура во норма.".to_string(),
        price: None,
        currency_id: None,
        prescription_notes: None,
        line_items: vec![],
        diagnosis_ids: vec![],
    }
}

fn line(id: i64, quantity: i32) -> RecordTemplateLineItemInput {
    RecordTemplateLineItemInput { line_item_template_id: id, quantity }
}

async fn template_count(db: &DatabaseConnection) -> i64 {
    let row = db
        .query_one(Statement::from_string(DbBackend::Sqlite, "SELECT COUNT(*) AS n FROM record_templates".to_string()))
        .await
        .unwrap()
        .unwrap();
    row.try_get("", "n").unwrap()
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_template_keeps_its_prescription_price_list_lines_and_diagnoses() {
    let db = create_test_db_with_migrations().await;
    let vat5 = rate_id(&db, "ДДВ 5%").await;
    let vaccine = price_item(&db, "Вакцина DHPPi", 900.0, Some(vat5)).await;
    let exam = price_item(&db, "Преглед", 500.0, None).await;
    let healthy = diagnosis(&db, "Здрав").await;

    let mut input = template_input("procedure", "Вакцинација");
    input.prescription_notes = Some("Без капење 3 дена.".to_string());
    input.line_items = vec![line(vaccine, 1), line(exam, 2)];
    input.diagnosis_ids = vec![healthy];
    let created = RecordTemplateService::create(&db, input).await.unwrap();

    let t = RecordTemplateService::get(&db, created.id).await.unwrap();
    assert_eq!(t.record_type, "procedure");
    assert_eq!(t.prescription_notes.as_deref(), Some("Без капење 3 дена."));
    assert_eq!(t.diagnosis_ids, vec![healthy]);
    assert_eq!(t.line_items.len(), 2);
    let first = &t.line_items[0];
    assert_eq!(first.line_item_template_id, vaccine);
    assert_eq!(first.name, "Вакцина DHPPi");
    assert_eq!(first.unit_price, 900.0);
    assert_eq!(first.currency_id, 1);
    assert_eq!(first.quantity, 1);
    assert_eq!(first.tax_rate_id, Some(vat5));
    assert_eq!(first.vat_name.as_deref(), Some("ДДВ 5%"));
    assert_eq!(first.vat_percent, Some(5.0));
    assert!(first.is_active);
    let second = &t.line_items[1];
    assert_eq!(second.line_item_template_id, exam);
    assert_eq!(second.quantity, 2);
    assert_eq!(second.tax_rate_id, None);
    assert_eq!(second.vat_percent, None);
}

#[tokio::test]
async fn a_template_line_takes_price_and_vat_from_the_price_list_when_used() {
    let db = create_test_db_with_migrations().await;
    let vat18 = rate_id(&db, "ДДВ 18%").await;
    let vat5 = rate_id(&db, "ДДВ 5%").await;
    let vaccine = price_item(&db, "Вакцина", 900.0, Some(vat18)).await;
    let mut input = template_input("procedure", "Вакцинација");
    input.line_items = vec![line(vaccine, 1)];
    let created = RecordTemplateService::create(&db, input).await.unwrap();

    LineItemService::update_template(
        &db,
        vaccine,
        UpdateLineItemTemplateInput {
            name: None,
            description: None,
            default_price: Some(950.0),
            currency_id: None,
            is_active: None,
            display_order: None,
            default_tax_rate_id: MaybeNull::Value(vat5),
        },
    )
    .await
    .unwrap();

    let t = RecordTemplateService::get(&db, created.id).await.unwrap();
    assert_eq!(t.line_items[0].unit_price, 950.0);
    assert_eq!(t.line_items[0].tax_rate_id, Some(vat5));
    assert_eq!(t.line_items[0].vat_percent, Some(5.0));
}

#[tokio::test]
async fn a_retired_price_list_item_is_marked_inactive_on_the_template() {
    let db = create_test_db_with_migrations().await;
    let old = price_item(&db, "Стара вакцина", 700.0, None).await;
    let mut input = template_input("procedure", "Вакцинација");
    input.line_items = vec![line(old, 1)];
    let created = RecordTemplateService::create(&db, input).await.unwrap();

    LineItemService::delete_template(&db, old).await.unwrap();

    let t = RecordTemplateService::get(&db, created.id).await.unwrap();
    assert_eq!(t.line_items.len(), 1);
    assert!(!t.line_items[0].is_active);
}

#[tokio::test]
async fn a_template_saved_before_this_change_still_lists_and_has_no_extras() {
    let db = create_test_db_with_migrations().await;
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "INSERT INTO record_templates (record_type, title, description) VALUES ('note', 'Контрола', 'Контролен преглед')"
            .to_string(),
    ))
    .await
    .unwrap();

    let all = RecordTemplateService::list(&db, None).await.unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].title, "Контрола");
    assert_eq!(all[0].prescription_notes, None);
    assert!(all[0].line_items.is_empty());
    assert!(all[0].diagnosis_ids.is_empty());
}

#[tokio::test]
async fn the_list_without_a_type_holds_every_type_and_search_ignores_cyrillic_case() {
    let db = create_test_db_with_migrations().await;
    RecordTemplateService::create(&db, template_input("procedure", "Вакцинација")).await.unwrap();
    RecordTemplateService::create(&db, template_input("note", "Контрола")).await.unwrap();

    let all = RecordTemplateService::list(&db, None).await.unwrap();
    assert_eq!(all.len(), 2);
    let notes = RecordTemplateService::list(&db, Some("note")).await.unwrap();
    assert_eq!(notes.len(), 1);

    let found = RecordTemplateService::search(&db, "ВАКЦ", None).await.unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].title, "Вакцинација");
}

#[tokio::test]
async fn an_update_replaces_what_it_sends_and_keeps_the_rest() {
    let db = create_test_db_with_migrations().await;
    let vaccine = price_item(&db, "Вакцина", 900.0, None).await;
    let exam = price_item(&db, "Преглед", 500.0, None).await;
    let healthy = diagnosis(&db, "Здрав").await;
    let otitis = diagnosis(&db, "Отитис").await;
    let mut input = template_input("note", "Вакцинација");
    input.prescription_notes = Some("Без капење.".to_string());
    input.line_items = vec![line(vaccine, 1)];
    input.diagnosis_ids = vec![healthy];
    let created = RecordTemplateService::create(&db, input).await.unwrap();

    // Only the title: everything else stays.
    let t = RecordTemplateService::update(
        &db,
        created.id,
        UpdateRecordTemplateInput { title: Some("Вакцина".to_string()), ..Default::default() },
    )
    .await
    .unwrap();
    assert_eq!(t.title, "Вакцина");
    assert_eq!(t.prescription_notes.as_deref(), Some("Без капење."));
    assert_eq!(t.line_items.len(), 1);
    assert_eq!(t.diagnosis_ids, vec![healthy]);

    // Type, lines and diagnoses replaced; a blank prescription clears it.
    let t = RecordTemplateService::update(
        &db,
        created.id,
        UpdateRecordTemplateInput {
            record_type: Some("procedure".to_string()),
            prescription_notes: Some("  ".to_string()),
            line_items: Some(vec![line(exam, 3)]),
            diagnosis_ids: Some(vec![otitis]),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(t.record_type, "procedure");
    assert_eq!(t.prescription_notes, None);
    assert_eq!(t.line_items.len(), 1);
    assert_eq!(t.line_items[0].line_item_template_id, exam);
    assert_eq!(t.line_items[0].quantity, 3);
    assert_eq!(t.diagnosis_ids, vec![otitis]);
}

#[tokio::test]
async fn bad_template_input_is_refused_and_nothing_is_saved() {
    let db = create_test_db_with_migrations().await;
    let vaccine = price_item(&db, "Вакцина", 900.0, None).await;

    let mut zero = template_input("procedure", "A");
    zero.line_items = vec![line(vaccine, 0)];
    assert!(RecordTemplateService::create(&db, zero).await.is_err());

    let mut unknown_item = template_input("procedure", "B");
    unknown_item.line_items = vec![line(999_999, 1)];
    assert!(RecordTemplateService::create(&db, unknown_item).await.is_err());

    let mut unknown_diagnosis = template_input("procedure", "C");
    unknown_diagnosis.diagnosis_ids = vec![999_999];
    assert!(RecordTemplateService::create(&db, unknown_diagnosis).await.is_err());

    assert!(RecordTemplateService::create(&db, template_input("visit", "D")).await.is_err());
    assert_eq!(template_count(&db).await, 0);

    let created = RecordTemplateService::create(&db, template_input("procedure", "E")).await.unwrap();
    let bad_update = UpdateRecordTemplateInput { record_type: Some("visit".to_string()), ..Default::default() };
    assert!(RecordTemplateService::update(&db, created.id, bad_update).await.is_err());
    assert_eq!(RecordTemplateService::get(&db, created.id).await.unwrap().record_type, "procedure");
}

#[tokio::test]
async fn deleting_a_template_removes_its_lines_and_diagnoses() {
    let db = create_test_db_with_migrations().await;
    let vaccine = price_item(&db, "Вакцина", 900.0, None).await;
    let healthy = diagnosis(&db, "Здрав").await;
    let mut input = template_input("procedure", "Вакцинација");
    input.line_items = vec![line(vaccine, 1)];
    input.diagnosis_ids = vec![healthy];
    let created = RecordTemplateService::create(&db, input).await.unwrap();

    RecordTemplateService::delete(&db, created.id).await.unwrap();

    for table in ["record_template_line_items", "record_template_diagnoses"] {
        let row = db
            .query_one(Statement::from_string(DbBackend::Sqlite, format!("SELECT COUNT(*) AS n FROM {}", table)))
            .await
            .unwrap()
            .unwrap();
        let n: i64 = row.try_get("", "n").unwrap();
        assert_eq!(n, 0, "{} still has rows", table);
    }
    // A diagnosis used by a deleted template can be deleted for good.
    DiagnosisService::hard_delete(&Arc::new(db.db.clone()), healthy).await.unwrap();
}

// ---------------------------------------------------------------------------
// Copy from last record
// ---------------------------------------------------------------------------

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

fn record(patient_id: i64, record_type: &str, name: &str, prescription: Option<&str>, items: Vec<CreateLineItemInput>) -> CreateMedicalRecordInput {
    CreateMedicalRecordInput {
        patient_id,
        record_type: record_type.to_string(),
        name: name.to_string(),
        procedure_name: None,
        description: format!("{} — опис", name),
        prescription_notes: prescription.map(str::to_string),
        price: None,
        currency_id: None,
        discount_percent: None,
        manual_total: None,
        device_test_data: None,
        device_type: None,
        device_name: None,
        device_data_list: None,
        line_items: if items.is_empty() { None } else { Some(items) },
    }
}

fn record_line(name: &str, price: f64, quantity: i32) -> CreateLineItemInput {
    CreateLineItemInput {
        template_id: None,
        name: name.to_string(),
        description: None,
        unit_price: price,
        currency_id: 1,
        quantity,
        tax_rate_id: MaybeNull::Undefined,
    }
}

async fn backdate(db: &DatabaseConnection, record_id: i64, when: &str) {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE medical_records SET created_at = ? WHERE id = ?",
        [when.into(), record_id.into()],
    ))
    .await
    .unwrap();
}

#[tokio::test]
async fn copy_takes_text_prescription_diagnoses_and_lines_from_the_latest_record() {
    let db = create_test_db_with_migrations().await;
    let patient = seed_patient(&db).await;
    let otitis = diagnosis(&db, "Отитис").await;

    let older = MedicalRecordService::save_new_record(&db, record(patient, "procedure", "Прв преглед", Some("Стар рецепт"), vec![]))
        .await
        .unwrap();
    backdate(&db, older.id, "2026-10-01T09:00:00+00:00").await;
    let latest = MedicalRecordService::save_new_record(
        &db,
        record(patient, "procedure", "Контрола", Some("Капки 2x дневно"), vec![record_line("Капки", 350.0, 2)]),
    )
    .await
    .unwrap();
    backdate(&db, latest.id, "2026-10-15T09:00:00+00:00").await;
    DiagnosisService::set_for_record(&Arc::new(db.db.clone()), latest.id, &[otitis]).await.unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE medical_records SET invoice_number = '2026-0007', invoice_date = '2026-10-15' WHERE id = ?",
        [latest.id.into()],
    ))
    .await
    .unwrap();

    let copy = RecordTemplateService::last_record_copy(&db, patient).await.unwrap().expect("a record to copy");
    assert_eq!(copy.record_id, latest.id);
    assert_eq!(copy.name, "Контрола");
    assert_eq!(copy.description, "Контрола — опис");
    assert_eq!(copy.prescription_notes.as_deref(), Some("Капки 2x дневно"));
    assert_eq!(copy.diagnosis_ids, vec![otitis]);
    assert_eq!(copy.line_items.len(), 1);
    assert_eq!(copy.line_items[0].name, "Капки");
    assert_eq!(copy.line_items[0].quantity, 2);

    let json = serde_json::to_value(&copy).unwrap();
    for never in ["invoiceNumber", "invoiceDate", "attachments"] {
        assert!(json.get(never).is_none(), "{} must never be copied", never);
    }
}

#[tokio::test]
async fn copy_skips_archived_and_lab_result_records() {
    let db = create_test_db_with_migrations().await;
    let patient = seed_patient(&db).await;
    let consult = MedicalRecordService::save_new_record(&db, record(patient, "note", "Консултација", None, vec![]))
        .await
        .unwrap();
    backdate(&db, consult.id, "2026-10-01T09:00:00+00:00").await;
    let archived = MedicalRecordService::save_new_record(&db, record(patient, "procedure", "Архивиран", None, vec![]))
        .await
        .unwrap();
    backdate(&db, archived.id, "2026-10-10T09:00:00+00:00").await;
    MedicalRecordService::archive_medical_record(&db, archived.id, true).await.unwrap();
    let lab = MedicalRecordService::save_new_record(&db, record(patient, "test_result", "Крвна слика", None, vec![]))
        .await
        .unwrap();
    backdate(&db, lab.id, "2026-10-20T09:00:00+00:00").await;

    let copy = RecordTemplateService::last_record_copy(&db, patient).await.unwrap().unwrap();
    assert_eq!(copy.record_id, consult.id);
}

#[tokio::test]
async fn copy_finds_nothing_for_a_patient_without_records() {
    let db = create_test_db_with_migrations().await;
    let patient = seed_patient(&db).await;
    assert!(RecordTemplateService::last_record_copy(&db, patient).await.unwrap().is_none());
}

// ---------------------------------------------------------------------------
// Deleting files on a saved record
// ---------------------------------------------------------------------------

async fn attachment(db: &DatabaseConnection, record_id: i64, attachment_type: Option<&str>) -> i64 {
    let res = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, file_size, mime_type, attachment_type) \
             VALUES (?, ?, 'x.pdf', 10, 'application/pdf', ?)",
            [
                record_id.into(),
                uuid::Uuid::new_v4().to_string().into(),
                sea_orm::Value::String(attachment_type.map(|s| Box::new(s.to_string()))),
            ],
        ))
        .await
        .unwrap();
    res.last_insert_id() as i64
}

async fn is_deleted(db: &DatabaseConnection, id: i64) -> bool {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT deleted_at FROM medical_attachments WHERE id = ?",
            [id.into()],
        ))
        .await
        .unwrap()
        .unwrap();
    row.try_get::<Option<String>>("", "deleted_at").unwrap().is_some()
}

#[tokio::test]
async fn a_user_file_can_be_deleted_but_a_generated_document_cannot() {
    let db = create_test_db_with_migrations().await;
    let patient = seed_patient(&db).await;
    let rec = MedicalRecordService::save_new_record(&db, record(patient, "procedure", "Преглед", None, vec![]))
        .await
        .unwrap();

    for kept in ["simple_report", "pharmacy_note", "invoice", "generated_pdf"] {
        let id = attachment(&db, rec.id, Some(kept)).await;
        assert!(FileStorageService::delete_user_attachment(&db, id).await.is_err(), "{} was deleted", kept);
        assert!(!is_deleted(&db, id).await, "{} was deleted", kept);
    }
    for removable in [Some("file"), Some("test_result"), None] {
        let id = attachment(&db, rec.id, removable).await;
        FileStorageService::delete_user_attachment(&db, id).await.unwrap();
        assert!(is_deleted(&db, id).await, "{:?} was kept", removable);
    }
}
