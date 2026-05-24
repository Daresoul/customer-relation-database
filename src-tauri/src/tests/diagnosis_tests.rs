//! CRUD + medical-record-linkage tests for `DiagnosisService`.
//!
//! These cover the contract the frontend depends on:
//!   - Create / list / update / soft-delete (deactivate) / hard-delete
//!   - Case-insensitive name uniqueness (UNIQUE COLLATE NOCASE)
//!   - Hard-delete blocked while a record links to the diagnosis
//!     (FK ON DELETE RESTRICT)
//!   - set_for_record idempotency — running it twice with the same set
//!     leaves the junction table in the same state
//!   - list_for_record returns even inactive diagnoses (so historical
//!     records show their full original tag set)

use crate::models::diagnosis::{CreateDiagnosisInput, UpdateDiagnosisInput};
use crate::services::diagnosis::DiagnosisService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DbBackend, Statement};

/// Helper: insert a medical record directly via SQL (we don't need
/// the full create-record code path for these tests — just a valid
/// row to satisfy the FK on medical_record_diagnoses).
async fn insert_test_medical_record(
    db: &sea_orm::DatabaseConnection,
    patient_id: i64,
) -> i64 {
    let res = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_records (patient_id, record_type, name, description) \
             VALUES (?, 'procedure', 'Test record', 'For diagnosis tests')",
            vec![patient_id.into()],
        ))
        .await
        .expect("insert medical record");
    res.last_insert_id() as i64
}

/// Insert a minimal patient so we have a valid medical_record.patient_id
/// foreign key.
async fn insert_test_patient(db: &sea_orm::DatabaseConnection) -> i64 {
    let res = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO patients (name, species_id) VALUES ('Test Pet', 1)",
            vec![],
        ))
        .await
        .expect("insert patient");
    res.last_insert_id() as i64
}

#[tokio::test]
async fn create_diagnosis_returns_active_with_name() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let created = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: Some("Joint inflammation".to_string()),
            color: Some("#FF5722".to_string()),
        },
    )
    .await
    .expect("create");

    assert_eq!(created.name, "Arthritis");
    assert_eq!(created.description.as_deref(), Some("Joint inflammation"));
    assert_eq!(created.color.as_deref(), Some("#FF5722"));
    assert!(created.is_active);
    assert!(created.id > 0);
}

#[tokio::test]
async fn create_trims_whitespace_from_name() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let created = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "  Arthritis  ".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .expect("create");

    assert_eq!(created.name, "Arthritis");
}

#[tokio::test]
async fn create_rejects_empty_name() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let err = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "   ".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .expect_err("should fail on whitespace-only name");

    assert!(err.contains("required"), "got: {err}");
}

#[tokio::test]
async fn create_rejects_duplicate_name_case_insensitive() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .expect("first create");

    let err = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "ARTHRITIS".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .expect_err("second create with different case should fail");

    assert!(err.to_lowercase().contains("already exists"), "got: {err}");
}

#[tokio::test]
async fn create_rejects_duplicate_cyrillic_name_case_insensitive() {
    // Regression for the original bug report: SQLite's COLLATE NOCASE
    // only folds ASCII a-z / A-Z, so "Артритис" and "артритис" would
    // both insert successfully through the SQL UNIQUE constraint alone.
    // The Rust-side dedup (find_by_name_case_insensitive) uses full
    // Unicode case-folding and catches the duplicate.
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Артритис".to_string(), // Macedonian "Arthritis"
            description: None,
            color: None,
        },
    )
    .await
    .expect("first Cyrillic create");

    let err = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "артритис".to_string(), // same word, lowercase
            description: None,
            color: None,
        },
    )
    .await
    .expect_err("Cyrillic case variant should be rejected");

    assert!(err.to_lowercase().contains("already exists"), "got: {err}");
}

#[tokio::test]
async fn create_counts_codepoints_not_bytes_for_length_limit() {
    // Regression for the "100-character" cap being applied as a byte
    // limit: Cyrillic characters are 2 bytes each in UTF-8, so the old
    // .len() check rejected ~50-character Macedonian names at the
    // boundary. After the fix, 60 Cyrillic characters (120 bytes) is
    // well under the 100-character limit and should succeed.
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    // 60 copies of the letter "а" — 60 chars / 120 bytes
    let name_60_cyrillic = "а".repeat(60);
    assert_eq!(name_60_cyrillic.chars().count(), 60);
    assert_eq!(name_60_cyrillic.len(), 120);

    DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: name_60_cyrillic,
            description: None,
            color: None,
        },
    )
    .await
    .expect("60 Cyrillic chars should fit under the 100-char limit");

    // 101 chars should still be rejected.
    let name_101 = "Б".repeat(101);
    assert_eq!(name_101.chars().count(), 101);
    let err = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: name_101,
            description: None,
            color: None,
        },
    )
    .await
    .expect_err("101 chars should exceed the 100-char limit");
    assert!(err.contains("100 characters"), "got: {err}");
}

#[tokio::test]
async fn list_all_returns_active_only_by_default() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let a = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Active diagnosis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    let b = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Inactive diagnosis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::deactivate(&pool, b.id).await.unwrap();

    let active = DiagnosisService::list_all(&pool, true).await.unwrap();
    assert!(active.iter().any(|d| d.id == a.id));
    assert!(!active.iter().any(|d| d.id == b.id), "deactivated should not appear");

    let all = DiagnosisService::list_all(&pool, false).await.unwrap();
    assert!(all.iter().any(|d| d.id == a.id));
    assert!(all.iter().any(|d| d.id == b.id), "deactivated should appear when active_only=false");
}

#[tokio::test]
async fn update_renames_and_changes_color() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let created = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: Some("#FF0000".to_string()),
        },
    )
    .await
    .unwrap();

    let updated = DiagnosisService::update(
        &pool,
        created.id,
        UpdateDiagnosisInput {
            name: Some("Chronic arthritis".to_string()),
            description: Some("Long-term joint inflammation".to_string()),
            color: Some("#00FF00".to_string()),
            is_active: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(updated.name, "Chronic arthritis");
    assert_eq!(updated.description.as_deref(), Some("Long-term joint inflammation"));
    assert_eq!(updated.color.as_deref(), Some("#00FF00"));
}

#[tokio::test]
async fn update_to_existing_name_fails_case_insensitive() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    let b = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Bronchitis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    let err = DiagnosisService::update(
        &pool,
        b.id,
        UpdateDiagnosisInput {
            name: Some("arthritis".to_string()), // lowercase
            description: None,
            color: None,
            is_active: None,
        },
    )
    .await
    .expect_err("renaming to an existing (case-insensitive) name should fail");

    assert!(err.to_lowercase().contains("already exists"));
}

#[tokio::test]
async fn deactivate_keeps_row_but_flips_is_active() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let d = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::deactivate(&pool, d.id).await.unwrap();

    let after = DiagnosisService::get_by_id(&pool, d.id).await.unwrap();
    assert!(!after.is_active, "row should still exist but be inactive");
    assert_eq!(after.id, d.id);
    assert_eq!(after.name, "Arthritis");
}

#[tokio::test]
async fn hard_delete_succeeds_when_unlinked() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let d = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::hard_delete(&pool, d.id).await.unwrap();

    let err = DiagnosisService::get_by_id(&pool, d.id).await.unwrap_err();
    assert!(err.contains("not found"));
}

#[tokio::test]
async fn hard_delete_blocked_when_linked_to_record() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    // Create a patient + medical record, then a diagnosis, then link them.
    let patient_id = insert_test_patient(&pool).await;
    let record_id = insert_test_medical_record(&pool, patient_id).await;

    let d = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::set_for_record(&pool, record_id, &[d.id])
        .await
        .unwrap();

    // Now hard-delete must fail with the FK-restrict message.
    let err = DiagnosisService::hard_delete(&pool, d.id)
        .await
        .expect_err("hard delete should be blocked by FK");

    assert!(
        err.to_lowercase().contains("linked")
            || err.to_lowercase().contains("foreign"),
        "got: {err}"
    );
}

#[tokio::test]
async fn set_for_record_replaces_existing_set() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let patient_id = insert_test_patient(&pool).await;
    let record_id = insert_test_medical_record(&pool, patient_id).await;

    // Inline the three creates — async closures with borrowed args are
    // currently painful in stable Rust (the lifetime of `&str` arg can't
    // be tied to the returned future), so we just repeat the call.
    let arth = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput { name: "Arthritis".to_string(), description: None, color: None },
    )
    .await
    .unwrap();
    let bron = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput { name: "Bronchitis".to_string(), description: None, color: None },
    )
    .await
    .unwrap();
    let cati = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput { name: "Cataract".to_string(), description: None, color: None },
    )
    .await
    .unwrap();

    // First set: arth + bron
    DiagnosisService::set_for_record(&pool, record_id, &[arth.id, bron.id])
        .await
        .unwrap();
    let linked = DiagnosisService::list_for_record(&pool, record_id)
        .await
        .unwrap();
    let ids: Vec<i64> = linked.iter().map(|d| d.id).collect();
    assert!(ids.contains(&arth.id));
    assert!(ids.contains(&bron.id));
    assert!(!ids.contains(&cati.id));
    assert_eq!(linked.len(), 2);

    // Replace with just cati
    DiagnosisService::set_for_record(&pool, record_id, &[cati.id])
        .await
        .unwrap();
    let linked = DiagnosisService::list_for_record(&pool, record_id)
        .await
        .unwrap();
    let ids: Vec<i64> = linked.iter().map(|d| d.id).collect();
    assert_eq!(ids, vec![cati.id], "set_for_record should fully replace");
}

#[tokio::test]
async fn set_for_record_is_idempotent() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let patient_id = insert_test_patient(&pool).await;
    let record_id = insert_test_medical_record(&pool, patient_id).await;

    let d = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::set_for_record(&pool, record_id, &[d.id])
        .await
        .unwrap();
    // Running it again with the same set should not error, and the
    // junction table should still have exactly one row for this record.
    DiagnosisService::set_for_record(&pool, record_id, &[d.id])
        .await
        .unwrap();

    let linked = DiagnosisService::list_for_record(&pool, record_id)
        .await
        .unwrap();
    assert_eq!(linked.len(), 1);
    assert_eq!(linked[0].id, d.id);
}

#[tokio::test]
async fn set_for_record_with_empty_set_clears_all_diagnoses() {
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let patient_id = insert_test_patient(&pool).await;
    let record_id = insert_test_medical_record(&pool, patient_id).await;

    let d = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::set_for_record(&pool, record_id, &[d.id])
        .await
        .unwrap();
    DiagnosisService::set_for_record(&pool, record_id, &[])
        .await
        .unwrap();

    let linked = DiagnosisService::list_for_record(&pool, record_id)
        .await
        .unwrap();
    assert!(linked.is_empty(), "empty set should clear all links");
}

#[tokio::test]
async fn list_for_record_includes_inactive_diagnoses() {
    // Critical for historical records: if you tag a record with
    // "Arthritis" and later deactivate the diagnosis, opening that
    // record should still show the tag with its full label.
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let patient_id = insert_test_patient(&pool).await;
    let record_id = insert_test_medical_record(&pool, patient_id).await;

    let d = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Old diagnosis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::set_for_record(&pool, record_id, &[d.id])
        .await
        .unwrap();
    DiagnosisService::deactivate(&pool, d.id).await.unwrap();

    let linked = DiagnosisService::list_for_record(&pool, record_id)
        .await
        .unwrap();
    assert_eq!(linked.len(), 1);
    assert_eq!(linked[0].name, "Old diagnosis");
    assert!(!linked[0].is_active);
}

#[tokio::test]
async fn cascade_delete_record_clears_diagnosis_links() {
    // ON DELETE CASCADE on the medical_record FK means deleting a
    // record automatically drops its junction rows. The diagnoses
    // themselves stay (they're master data referenced from possibly
    // many records).
    let test_db = create_test_db_with_migrations().await;
    let pool = std::sync::Arc::new(test_db.db.clone());

    let patient_id = insert_test_patient(&pool).await;
    let record_id = insert_test_medical_record(&pool, patient_id).await;

    let d = DiagnosisService::create(
        &pool,
        CreateDiagnosisInput {
            name: "Arthritis".to_string(),
            description: None,
            color: None,
        },
    )
    .await
    .unwrap();

    DiagnosisService::set_for_record(&pool, record_id, &[d.id])
        .await
        .unwrap();

    // Delete the medical record directly via SQL (no service method
    // because deletion is handled elsewhere in the codebase).
    pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM medical_records WHERE id = ?",
        vec![record_id.into()],
    ))
    .await
    .unwrap();

    // The diagnosis is still around as master data.
    let still_exists = DiagnosisService::get_by_id(&pool, d.id).await;
    assert!(still_exists.is_ok());

    // But there should be zero junction rows now.
    let rows = pool
        .query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS c FROM medical_record_diagnoses WHERE diagnosis_id = ?",
            vec![d.id.into()],
        ))
        .await
        .unwrap();
    let count: i64 = rows[0].try_get("", "c").unwrap();
    assert_eq!(count, 0, "cascade should have cleared junction rows");
}
