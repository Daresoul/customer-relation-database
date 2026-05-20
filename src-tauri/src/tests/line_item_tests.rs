//! LineItemService CRUD + edge case tests.
//!
//! Two surfaces: line-item *templates* (reusable, kept in Settings) and
//! per-medical-record *items* (children of a specific medical record).

use crate::models::dto::CreatePatientDto;
use crate::models::line_item::{
    CreateLineItemInput, CreateLineItemTemplateInput, UpdateLineItemTemplateInput,
};
use crate::services::line_item::LineItemService;
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DbBackend, Statement};

async fn seed_patient_and_record(db: &sea_orm::DatabaseConnection) -> i64 {
    let p = PatientService::create(
        db,
        CreatePatientDto {
            name: Some("Pet".to_string()),
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
    .unwrap();
    let result = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_records (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
             VALUES (?, 'procedure', 'Record', 'desc', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [p.id.into()],
        ))
        .await
        .unwrap();
    result.last_insert_id() as i64
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_template_happy_path() {
    let db = create_test_db_with_migrations().await;
    let t = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Consultation".to_string(),
            description: Some("Standard 30-min consult".to_string()),
            default_price: 50.0,
            currency_id: 1,
        },
    )
    .await
    .unwrap();
    assert_eq!(t.name, "Consultation");
    assert_eq!(t.default_price, 50.0);
    assert!(t.is_active);
    assert!(t.id > 0);
}

#[tokio::test]
async fn create_template_with_invalid_currency_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let result = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Bad".to_string(),
            description: None,
            default_price: 10.0,
            currency_id: 99999,
        },
    )
    .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn create_template_with_zero_price_succeeds() {
    // Zero-priced items are valid (e.g., free consultations, courtesy items)
    let db = create_test_db_with_migrations().await;
    let r = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Free".to_string(),
            description: None,
            default_price: 0.0,
            currency_id: 1,
        },
    )
    .await;
    assert!(r.is_ok());
}

#[tokio::test]
async fn create_template_with_negative_price_rejected() {
    // Backend validates default_price >= 0 (either via service-level check or
    // DB CHECK constraint). Negative prices don't make sense for a line item
    // template — refunds happen via discount logic.
    let db = create_test_db_with_migrations().await;
    let r = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Refund-like".to_string(),
            description: None,
            default_price: -10.0,
            currency_id: 1,
        },
    )
    .await;
    assert!(r.is_err(), "negative price should be rejected");
}

#[tokio::test]
async fn get_templates_returns_inserted_rows() {
    let db = create_test_db_with_migrations().await;
    for n in ["A", "B", "C"] {
        LineItemService::create_template(
            &db,
            CreateLineItemTemplateInput {
                name: n.to_string(),
                description: None,
                default_price: 10.0,
                currency_id: 1,
            },
        )
        .await
        .unwrap();
    }
    let all = LineItemService::get_templates(&db, false).await.unwrap();
    assert_eq!(all.len(), 3);
}

#[tokio::test]
async fn get_templates_active_only_filters_inactive() {
    let db = create_test_db_with_migrations().await;
    let active = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Active".to_string(), description: None, default_price: 10.0, currency_id: 1,
        },
    ).await.unwrap();
    let toggle_off = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Inactive".to_string(), description: None, default_price: 10.0, currency_id: 1,
        },
    ).await.unwrap();

    LineItemService::update_template(
        &db,
        toggle_off.id,
        UpdateLineItemTemplateInput {
            name: None, description: None, default_price: None, currency_id: None,
            is_active: Some(false), display_order: None,
        },
    ).await.unwrap();

    let only_active = LineItemService::get_templates(&db, true).await.unwrap();
    assert_eq!(only_active.len(), 1);
    assert_eq!(only_active[0].id, active.id);
}

#[tokio::test]
async fn update_template_partial_keeps_other_fields() {
    let db = create_test_db_with_migrations().await;
    let t = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Original".to_string(),
            description: Some("Original desc".to_string()),
            default_price: 100.0,
            currency_id: 1,
        },
    ).await.unwrap();

    let updated = LineItemService::update_template(
        &db,
        t.id,
        UpdateLineItemTemplateInput {
            name: Some("Renamed".to_string()),
            description: None,
            default_price: None,
            currency_id: None,
            is_active: None,
            display_order: None,
        },
    ).await.unwrap();

    assert_eq!(updated.name, "Renamed");
    assert_eq!(updated.description.as_deref(), Some("Original desc"), "untouched field stays");
    assert_eq!(updated.default_price, 100.0);
}

#[tokio::test]
async fn delete_template_removes_row() {
    let db = create_test_db_with_migrations().await;
    let t = LineItemService::create_template(
        &db,
        CreateLineItemTemplateInput {
            name: "Doomed".to_string(), description: None, default_price: 10.0, currency_id: 1,
        },
    ).await.unwrap();
    LineItemService::delete_template(&db, t.id).await.unwrap();
    let result = LineItemService::get_template_by_id(&db, t.id).await;
    assert!(result.is_err() || result.as_ref().ok().map(|t| t.is_active == false).unwrap_or(false),
        "should be deleted or marked inactive");
}

#[tokio::test]
async fn get_template_by_id_nonexistent_errors() {
    let db = create_test_db_with_migrations().await;
    let r = LineItemService::get_template_by_id(&db, 99999).await;
    assert!(r.is_err());
}

// ---------------------------------------------------------------------------
// Per-record line items
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_line_items_for_record_persists_them() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_patient_and_record(&db).await;

    let items = vec![
        CreateLineItemInput {
            template_id: None,
            name: "Vaccine".to_string(),
            description: None,
            unit_price: 30.0,
            currency_id: 1,
            quantity: 2,
        },
        CreateLineItemInput {
            template_id: None,
            name: "Exam".to_string(),
            description: Some("General health check".to_string()),
            unit_price: 75.0,
            currency_id: 1,
            quantity: 1,
        },
    ];

    let created = LineItemService::create_line_items_for_record(&db, record_id, items)
        .await
        .unwrap();
    assert_eq!(created.len(), 2);
    assert_eq!(created[0].quantity, 2);
    assert_eq!(created[1].unit_price, 75.0);
}

#[tokio::test]
async fn create_line_items_with_invalid_record_id_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let items = vec![CreateLineItemInput {
        template_id: None,
        name: "Orphan".to_string(),
        description: None,
        unit_price: 10.0,
        currency_id: 1,
        quantity: 1,
    }];
    let r = LineItemService::create_line_items_for_record(&db, 99999, items).await;
    assert!(r.is_err());
}

#[tokio::test]
async fn create_line_items_with_invalid_template_id_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_patient_and_record(&db).await;
    let items = vec![CreateLineItemInput {
        template_id: Some(99999),
        name: "Bad-template".to_string(),
        description: None,
        unit_price: 10.0,
        currency_id: 1,
        quantity: 1,
    }];
    let r = LineItemService::create_line_items_for_record(&db, record_id, items).await;
    assert!(r.is_err());
}

#[tokio::test]
async fn get_line_items_for_record_returns_in_insert_order() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_patient_and_record(&db).await;

    let items: Vec<CreateLineItemInput> = ["A", "B", "C"]
        .iter()
        .map(|n| CreateLineItemInput {
            template_id: None,
            name: n.to_string(),
            description: None,
            unit_price: 10.0,
            currency_id: 1,
            quantity: 1,
        })
        .collect();

    LineItemService::create_line_items_for_record(&db, record_id, items)
        .await
        .unwrap();

    let fetched = LineItemService::get_line_items_for_record(&db, record_id)
        .await
        .unwrap();
    let names: Vec<&str> = fetched.iter().map(|i| i.name.as_str()).collect();
    assert_eq!(names, vec!["A", "B", "C"]);
}

#[tokio::test]
async fn replace_line_items_drops_old_and_inserts_new() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_patient_and_record(&db).await;

    // Initial set
    LineItemService::create_line_items_for_record(
        &db,
        record_id,
        vec![CreateLineItemInput {
            template_id: None, name: "Old".to_string(), description: None,
            unit_price: 10.0, currency_id: 1, quantity: 1,
        }],
    )
    .await
    .unwrap();

    // Replace with a different set
    let new_items = vec![
        CreateLineItemInput {
            template_id: None, name: "New1".to_string(), description: None,
            unit_price: 20.0, currency_id: 1, quantity: 1,
        },
        CreateLineItemInput {
            template_id: None, name: "New2".to_string(), description: None,
            unit_price: 30.0, currency_id: 1, quantity: 1,
        },
    ];
    LineItemService::replace_line_items_for_record(&db, record_id, new_items).await.unwrap();

    let fetched = LineItemService::get_line_items_for_record(&db, record_id).await.unwrap();
    let names: Vec<&str> = fetched.iter().map(|i| i.name.as_str()).collect();
    assert_eq!(names, vec!["New1", "New2"], "old items dropped, new ones present");
}

#[tokio::test]
async fn line_items_cascade_when_medical_record_deleted() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_patient_and_record(&db).await;

    LineItemService::create_line_items_for_record(
        &db,
        record_id,
        vec![CreateLineItemInput {
            template_id: None, name: "Will-be-orphaned".to_string(),
            description: None, unit_price: 10.0, currency_id: 1, quantity: 1,
        }],
    )
    .await
    .unwrap();

    // Delete the medical_record row directly
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM medical_records WHERE id = ?",
        [record_id.into()],
    )).await.unwrap();

    let leftover = LineItemService::get_line_items_for_record(&db, record_id).await.unwrap();
    assert!(leftover.is_empty(), "line items should cascade-delete with the record");
}

#[tokio::test]
async fn create_line_items_default_quantity_is_one() {
    // The DTO defaults quantity to 1 via serde — verify the resulting row
    // matches when input doesn't specify (using JSON-style construction).
    let db = create_test_db_with_migrations().await;
    let record_id = seed_patient_and_record(&db).await;

    let json = serde_json::json!({
        "templateId": null,
        "name": "Default-qty",
        "unitPrice": 25.0,
        "currencyId": 1
    });
    let input: CreateLineItemInput = serde_json::from_value(json).unwrap();
    assert_eq!(input.quantity, 1, "serde default kicks in");

    LineItemService::create_line_items_for_record(&db, record_id, vec![input])
        .await
        .unwrap();
    let fetched = LineItemService::get_line_items_for_record(&db, record_id)
        .await
        .unwrap();
    assert_eq!(fetched[0].quantity, 1);
}
