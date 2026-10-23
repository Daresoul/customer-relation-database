//! Clinic profile, VAT rates, VAT on line items and the invoice sent to Java.

use crate::models::dto::{CreatePatientDto, MaybeNull};
use crate::models::line_item::{CreateLineItemInput, CreateLineItemTemplateInput, UpdateLineItemTemplateInput};
use crate::models::medical::CreateMedicalRecordInput;
use crate::models::settings::{CreateTaxRateInput, UpdateClinicProfileInput, UpdateTaxRateInput};
use crate::services::java_pdf_service::JavaPdfService;
use crate::services::line_item::LineItemService;
use crate::services::medical_record::{MedicalRecordService, PdfEnv};
use crate::services::patient::PatientService;
use crate::services::settings::SettingsService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::DatabaseConnection;

fn profile_input() -> UpdateClinicProfileInput {
    UpdateClinicProfileInput {
        name: Some("  Д-р Ана Тестовска ".to_string()),
        address: Some("Партизанска 5".to_string()),
        city: Some("7000 Битола".to_string()),
        phone: Some("047 111 222".to_string()),
        email: Some("ana@vet.mk".to_string()),
        tax_number: Some("4002999111222".to_string()),
        registration_number: Some("".to_string()),
        bank_account: None,
        bank_name: None,
        prices_include_vat: Some(true),
    }
}

async fn rate_id(db: &DatabaseConnection, name: &str) -> i64 {
    SettingsService::list_tax_rates(db, false)
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.name == name)
        .unwrap_or_else(|| panic!("no rate {}", name))
        .id
}

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

fn item(name: &str, price: f64, template_id: Option<i64>, tax_rate_id: MaybeNull<i64>) -> CreateLineItemInput {
    CreateLineItemInput {
        template_id,
        name: name.to_string(),
        description: None,
        unit_price: price,
        currency_id: 1,
        quantity: 1,
        tax_rate_id,
    }
}

fn record(patient_id: i64, discount: Option<f64>, items: Vec<CreateLineItemInput>) -> CreateMedicalRecordInput {
    CreateMedicalRecordInput {
        patient_id,
        record_type: "procedure".to_string(),
        name: "Visit".to_string(),
        procedure_name: None,
        description: "Notes".to_string(),
        prescription_notes: None,
        price: None,
        currency_id: None,
        discount_percent: discount,
        manual_total: None,
        device_test_data: None,
        device_type: None,
        device_name: None,
        device_data_list: None,
        line_items: Some(items),
    }
}

// ---------------------------------------------------------------------------
// Clinic profile
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_new_install_has_an_empty_profile_with_prices_including_vat() {
    let db = create_test_db_with_migrations().await;
    let p = SettingsService::get_clinic_profile(&db).await.unwrap();
    assert_eq!(p.name, None);
    assert_eq!(p.logo_path, None);
    assert!(p.prices_include_vat);
}

#[tokio::test]
async fn the_profile_is_saved_trimmed_and_blank_fields_are_cleared() {
    let db = create_test_db_with_migrations().await;
    SettingsService::update_clinic_profile(&db, profile_input()).await.unwrap();
    let p = SettingsService::get_clinic_profile(&db).await.unwrap();
    assert_eq!(p.name.as_deref(), Some("Д-р Ана Тестовска"));
    assert_eq!(p.city.as_deref(), Some("7000 Битола"));
    assert_eq!(p.tax_number.as_deref(), Some("4002999111222"));
    assert_eq!(p.registration_number, None);

    let mut cleared = profile_input();
    cleared.phone = None;
    cleared.prices_include_vat = Some(false);
    let p = SettingsService::update_clinic_profile(&db, cleared).await.unwrap();
    assert_eq!(p.phone, None);
    assert!(!p.prices_include_vat);
}

fn png_bytes() -> Vec<u8> {
    let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    bytes.extend_from_slice(&[0u8; 64]);
    bytes
}

#[tokio::test]
async fn a_logo_is_copied_into_the_app_folder() {
    let db = create_test_db_with_migrations().await;
    let src = tempfile::tempdir().unwrap();
    let app = tempfile::tempdir().unwrap();
    let logo = src.path().join("logo.png");
    std::fs::write(&logo, png_bytes()).unwrap();

    let p = SettingsService::set_clinic_logo(&db, app.path(), &logo).await.unwrap();
    let stored = std::path::PathBuf::from(p.logo_path.clone().unwrap());
    assert!(stored.starts_with(app.path()));
    assert_eq!(std::fs::read(&stored).unwrap(), png_bytes());

    std::fs::write(&logo, png_bytes()).unwrap();
    let replaced = SettingsService::set_clinic_logo(&db, app.path(), &logo).await.unwrap();
    assert!(std::path::Path::new(replaced.logo_path.as_ref().unwrap()).exists());
    assert_eq!(std::fs::read_dir(app.path()).unwrap().count(), 1, "the old logo is removed");

    let removed = SettingsService::remove_clinic_logo(&db).await.unwrap();
    assert_eq!(removed.logo_path, None);
    assert_eq!(std::fs::read_dir(app.path()).unwrap().count(), 0);
}

#[tokio::test]
async fn a_logo_must_be_a_small_png_or_jpg() {
    let db = create_test_db_with_migrations().await;
    let src = tempfile::tempdir().unwrap();
    let app = tempfile::tempdir().unwrap();

    let gif = src.path().join("logo.gif");
    std::fs::write(&gif, b"GIF89a....").unwrap();
    assert!(SettingsService::set_clinic_logo(&db, app.path(), &gif).await.is_err());

    let fake = src.path().join("logo.png");
    std::fs::write(&fake, b"not a png").unwrap();
    assert!(SettingsService::set_clinic_logo(&db, app.path(), &fake).await.is_err());

    let big = src.path().join("big.png");
    let mut bytes = png_bytes();
    bytes.resize(2 * 1024 * 1024 + 1, 0);
    std::fs::write(&big, bytes).unwrap();
    assert!(SettingsService::set_clinic_logo(&db, app.path(), &big).await.is_err());

    assert_eq!(SettingsService::get_clinic_profile(&db).await.unwrap().logo_path, None);
}

// ---------------------------------------------------------------------------
// VAT rates
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_new_install_offers_the_macedonian_rates_with_none_as_default() {
    let db = create_test_db_with_migrations().await;
    let rates = SettingsService::list_tax_rates(&db, true).await.unwrap();
    let names: Vec<(&str, f64)> = rates.iter().map(|r| (r.name.as_str(), r.percent)).collect();
    assert_eq!(names, vec![("ДДВ 18%", 18.0), ("ДДВ 5%", 5.0), ("0%", 0.0)]);
    assert!(rates.iter().all(|r| !r.is_default));
}

#[tokio::test]
async fn only_one_rate_is_the_default() {
    let db = create_test_db_with_migrations().await;
    let r18 = rate_id(&db, "ДДВ 18%").await;
    let r5 = rate_id(&db, "ДДВ 5%").await;
    SettingsService::update_tax_rate(&db, r18, UpdateTaxRateInput { is_default: Some(true), ..Default::default() }).await.unwrap();
    SettingsService::update_tax_rate(&db, r5, UpdateTaxRateInput { is_default: Some(true), ..Default::default() }).await.unwrap();
    let defaults: Vec<i64> = SettingsService::list_tax_rates(&db, false).await.unwrap()
        .into_iter().filter(|r| r.is_default).map(|r| r.id).collect();
    assert_eq!(defaults, vec![r5]);
}

#[tokio::test]
async fn a_rate_needs_a_name_and_a_percent_from_0_to_100() {
    let db = create_test_db_with_migrations().await;
    for (name, percent) in [("", 10.0), ("Bad", -1.0), ("Bad", 100.5)] {
        let r = SettingsService::create_tax_rate(&db, CreateTaxRateInput { name: name.to_string(), percent, is_default: None }).await;
        assert!(r.is_err(), "{} {}", name, percent);
    }
    let ok = SettingsService::create_tax_rate(&db, CreateTaxRateInput { name: "ДДВ 10%".to_string(), percent: 10.0, is_default: None }).await.unwrap();
    assert_eq!(ok.percent, 10.0);
}

#[tokio::test]
async fn a_hidden_rate_leaves_the_picker_but_stays_listed() {
    let db = create_test_db_with_migrations().await;
    let r5 = rate_id(&db, "ДДВ 5%").await;
    SettingsService::update_tax_rate(&db, r5, UpdateTaxRateInput { is_active: Some(false), ..Default::default() }).await.unwrap();
    assert!(SettingsService::list_tax_rates(&db, true).await.unwrap().iter().all(|r| r.id != r5));
    assert!(SettingsService::list_tax_rates(&db, false).await.unwrap().iter().any(|r| r.id == r5));
}

// ---------------------------------------------------------------------------
// VAT on templates and record line items
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_template_keeps_its_default_rate_and_it_can_be_cleared() {
    let db = create_test_db_with_migrations().await;
    let r18 = rate_id(&db, "ДДВ 18%").await;
    let t = LineItemService::create_template(&db, CreateLineItemTemplateInput {
        name: "Exam".to_string(),
        description: None,
        default_price: 1180.0,
        currency_id: 1,
        default_tax_rate_id: Some(r18),
    }).await.unwrap();
    assert_eq!(t.default_tax_rate_id, Some(r18));

    let cleared = LineItemService::update_template(&db, t.id, UpdateLineItemTemplateInput {
        name: None,
        description: None,
        default_price: None,
        currency_id: None,
        is_active: None,
        display_order: None,
        default_tax_rate_id: MaybeNull::Null,
    }).await.unwrap();
    assert_eq!(cleared.default_tax_rate_id, None);
}

#[tokio::test]
async fn a_line_item_keeps_the_rate_it_was_saved_with() {
    let db = create_test_db_with_migrations().await;
    let r18 = rate_id(&db, "ДДВ 18%").await;
    let patient_id = seed_patient(&db).await;
    let saved = MedicalRecordService::save_new_record(&db, record(patient_id, None, vec![
        item("Surgery", 1180.0, None, MaybeNull::Value(r18)),
        item("Walk-in", 300.0, None, MaybeNull::Undefined),
    ])).await.unwrap();

    SettingsService::update_tax_rate(&db, r18, UpdateTaxRateInput { percent: Some(20.0), ..Default::default() }).await.unwrap();

    let items = LineItemService::get_line_items_for_record(&db, saved.id).await.unwrap();
    assert_eq!((items[0].tax_rate_id, items[0].vat_percent, items[0].vat_name.as_deref()), (Some(r18), Some(18.0), Some("ДДВ 18%")));
    assert_eq!((items[1].tax_rate_id, items[1].vat_percent), (None, None));
}

#[tokio::test]
async fn a_template_item_without_a_rate_takes_the_templates_default_unless_null_is_sent() {
    let db = create_test_db_with_migrations().await;
    let r5 = rate_id(&db, "ДДВ 5%").await;
    let t = LineItemService::create_template(&db, CreateLineItemTemplateInput {
        name: "Drug".to_string(),
        description: None,
        default_price: 105.0,
        currency_id: 1,
        default_tax_rate_id: Some(r5),
    }).await.unwrap();
    let patient_id = seed_patient(&db).await;
    let saved = MedicalRecordService::save_new_record(&db, record(patient_id, None, vec![
        item("Drug", 105.0, Some(t.id), MaybeNull::Undefined),
        item("Drug", 105.0, Some(t.id), MaybeNull::Null),
    ])).await.unwrap();
    let items = LineItemService::get_line_items_for_record(&db, saved.id).await.unwrap();
    assert_eq!(items[0].vat_percent, Some(5.0));
    assert_eq!(items[1].vat_percent, None);
}

#[tokio::test]
async fn an_unknown_rate_is_refused() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let r = MedicalRecordService::save_new_record(&db, record(patient_id, None, vec![
        item("Surgery", 1180.0, None, MaybeNull::Value(9999)),
    ])).await;
    assert!(r.is_err());
}

// ---------------------------------------------------------------------------
// Invoice totals and the Java contract
// ---------------------------------------------------------------------------

#[tokio::test]
async fn an_old_record_without_rates_totals_what_it_always_did() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let saved = MedicalRecordService::save_new_record(&db, record(patient_id, Some(1.5), vec![
        item("Exam", 101.0, None, MaybeNull::Undefined),
    ])).await.unwrap();
    for gross in [true, false] {
        let mut p = profile_input();
        p.prices_include_vat = Some(gross);
        SettingsService::update_clinic_profile(&db, p).await.unwrap();
        let totals = MedicalRecordService::invoice_totals_for_record(&db, saved.id).await.unwrap();
        assert_eq!(totals.total, 99.49);
        assert!(totals.vat_groups.is_empty());
    }
}

#[tokio::test]
async fn record_totals_use_the_saved_rates_and_the_clinics_price_mode() {
    let db = create_test_db_with_migrations().await;
    let r18 = rate_id(&db, "ДДВ 18%").await;
    let patient_id = seed_patient(&db).await;
    let saved = MedicalRecordService::save_new_record(&db, record(patient_id, None, vec![
        item("Surgery", 1180.0, None, MaybeNull::Value(r18)),
    ])).await.unwrap();

    let gross = MedicalRecordService::invoice_totals_for_record(&db, saved.id).await.unwrap();
    assert_eq!((gross.total, gross.vat_total), (1180.0, 180.0));

    let mut p = profile_input();
    p.prices_include_vat = Some(false);
    SettingsService::update_clinic_profile(&db, p).await.unwrap();
    let net = MedicalRecordService::invoice_totals_for_record(&db, saved.id).await.unwrap();
    assert_eq!((net.total, net.vat_total), (1392.4, 212.4));
}

#[tokio::test]
async fn the_invoice_job_carries_the_clinic_and_the_totals() {
    let db = create_test_db_with_migrations().await;
    let r18 = rate_id(&db, "ДДВ 18%").await;
    SettingsService::update_clinic_profile(&db, profile_input()).await.unwrap();
    let patient_id = seed_patient(&db).await;
    let saved = MedicalRecordService::save_new_record(&db, record(patient_id, Some(10.0), vec![
        item("Surgery", 1180.0, None, MaybeNull::Value(r18)),
    ])).await.unwrap();

    let job = MedicalRecordService::invoice_job(&db, &saved).await.unwrap();

    assert_eq!(job["report_type"], "invoice");
    assert_eq!(job["clinic"]["name"], "Д-р Ана Тестовска");
    assert_eq!(job["clinic"]["tax_number"], "4002999111222");
    assert_eq!(job["line_items"][0]["vat_label"], "ДДВ 18%");
    assert_eq!(job["line_items"][0]["vat_percent"], 18.0);
    assert_eq!(job["totals"]["total"], 1062.0);
    assert_eq!(job["totals"]["discount_amount"], 118.0);
    assert_eq!(job["totals"]["prices_include_vat"], true);
    assert_eq!(job["totals"]["vat_groups"][0]["vat"], 162.0);
}

#[tokio::test]
async fn an_empty_profile_sends_no_clinic_fields() {
    let db = create_test_db_with_migrations().await;
    let clinic = SettingsService::get_clinic_profile(&db).await.unwrap();
    let json = JavaPdfService::clinic_json(&clinic);
    assert!(json.as_object().unwrap().values().all(|v| v.is_null()), "{}", json);
}

#[test]
fn a_job_without_a_clinic_gets_the_current_letterhead() {
    let clinic = crate::models::settings::ClinicProfile {
        name: Some("Д-р Ана".to_string()),
        ..Default::default()
    };
    let job = JavaPdfService::attach_clinic(serde_json::json!({"report_type": "device"}), Some(&clinic));
    assert_eq!(job["clinic"]["name"], "Д-р Ана");

    let own = serde_json::json!({"clinic": {"name": "Own"}});
    assert_eq!(JavaPdfService::attach_clinic(own, Some(&clinic))["clinic"]["name"], "Own");
    assert!(JavaPdfService::attach_clinic(serde_json::json!({}), None).get("clinic").is_none());
}

const DEV_JAR: &str = "../pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar";

#[tokio::test]
async fn the_jar_renders_every_document_with_a_profile_and_vat() {
    let jar = std::path::PathBuf::from(DEV_JAR);
    if !jar.exists() || std::process::Command::new("java").arg("-version").output().is_err() {
        eprintln!("SKIP: JAR not built ({})", DEV_JAR);
        return;
    }
    let storage = tempfile::tempdir().unwrap();
    let env = PdfEnv { jar_path: jar, storage_dir: storage.path().to_path_buf() };
    let db = create_test_db_with_migrations().await;
    let r18 = rate_id(&db, "ДДВ 18%").await;
    SettingsService::update_clinic_profile(&db, profile_input()).await.unwrap();
    let patient_id = seed_patient(&db).await;
    let mut input = record(patient_id, Some(10.0), vec![item("Surgery", 1180.0, None, MaybeNull::Value(r18))]);
    input.prescription_notes = Some("Amoxicillin".to_string());
    let saved = MedicalRecordService::save_new_record(&db, input).await.unwrap();

    let statuses = MedicalRecordService::generate_record_documents(&env, &db, &saved).await;
    for kind in ["report", "pharmacy_note", "invoice"] {
        assert!(statuses.iter().any(|s| s.kind == kind && s.ok), "{:?}", statuses);
    }
}
