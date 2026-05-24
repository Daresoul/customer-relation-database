//! Diagnosis CRUD + medical-record linkage.
//!
//! Mirrors the raw-sqlx pattern used in `managed_hid_scanner` —
//! direct SQL via the SeaORM pool's `Statement::from_sql_and_values`,
//! no entity layer. Diagnoses are simple master data; the entity
//! overhead isn't worth it for a flat table.

use crate::database::SeaOrmPool;
use crate::models::diagnosis::{CreateDiagnosisInput, Diagnosis, UpdateDiagnosisInput};
use chrono::{DateTime, NaiveDateTime, Utc};
use sea_orm::{ConnectionTrait, DbBackend, QueryResult, Statement, TransactionTrait};

pub struct DiagnosisService;

impl DiagnosisService {
    pub async fn list_all(pool: &SeaOrmPool, active_only: bool) -> Result<Vec<Diagnosis>, String> {
        let sql = if active_only {
            "SELECT id, name, description, color, is_active, created_at, updated_at \
             FROM diagnoses WHERE is_active = 1 ORDER BY name COLLATE NOCASE ASC"
        } else {
            "SELECT id, name, description, color, is_active, created_at, updated_at \
             FROM diagnoses ORDER BY is_active DESC, name COLLATE NOCASE ASC"
        };

        let rows = pool
            .query_all(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
            .await
            .map_err(|e| format!("list_diagnoses: {}", e))?;

        rows.iter().map(row_to_model).collect()
    }

    pub async fn get_by_id(pool: &SeaOrmPool, id: i64) -> Result<Diagnosis, String> {
        let row = pool
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, name, description, color, is_active, created_at, updated_at \
                 FROM diagnoses WHERE id = ?",
                vec![id.into()],
            ))
            .await
            .map_err(|e| format!("get_diagnosis: {}", e))?
            .ok_or_else(|| format!("Diagnosis {} not found", id))?;

        row_to_model(&row)
    }

    pub async fn create(
        pool: &SeaOrmPool,
        input: CreateDiagnosisInput,
    ) -> Result<Diagnosis, String> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err("Diagnosis name is required".into());
        }
        // `chars().count()` returns codepoints (what users intuitively call
        // "characters"). `str.len()` returns bytes — Cyrillic characters
        // are 2 bytes each in UTF-8, so .len()>100 wrongly rejects
        // Macedonian names at ~50 visible characters. The 100-character
        // ceiling is a UI-friendliness cap, not a storage limit, so it
        // should count what the user sees.
        if name.chars().count() > 100 {
            return Err("Diagnosis name must be 100 characters or fewer".into());
        }

        // SQLite's COLLATE NOCASE only folds ASCII a-z / A-Z. For Cyrillic
        // and other non-ASCII scripts, "Артритис" and "артритис" compare
        // as DIFFERENT under NOCASE, so the table's UNIQUE constraint
        // would let both rows in. Do the case-insensitive duplicate check
        // in Rust where `to_lowercase()` uses the full Unicode case-fold
        // tables and works for every script the app supports.
        if let Some(existing) = Self::find_by_name_case_insensitive(pool, name).await? {
            // Mirror what the SQLite-level UNIQUE error would have said
            // so callers get one consistent failure mode.
            let _ = existing;
            return Err("A diagnosis with this name already exists".to_string());
        }

        let res = pool
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO diagnoses (name, description, color, is_active) VALUES (?, ?, ?, 1)",
                vec![
                    name.into(),
                    input.description.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).into(),
                    input.color.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).into(),
                ],
            ))
            .await
            .map_err(|e| {
                // ASCII-only NOCASE still catches plain Latin dupes —
                // keep this fallback handler so we never bubble up a
                // raw SQLite error to the UI.
                if e.to_string().contains("UNIQUE") {
                    "A diagnosis with this name already exists".to_string()
                } else {
                    format!("create_diagnosis: {}", e)
                }
            })?;

        Self::get_by_id(pool, res.last_insert_id() as i64).await
    }

    /// Look up a diagnosis by name, case-insensitive across the full
    /// Unicode range (not just ASCII). Returns the matched ID if found.
    ///
    /// SQLite has no Unicode case-fold function out of the box, so we do
    /// the comparison in Rust: fetch all name + id pairs and fold each
    /// to lowercase via the standard library's Unicode-aware case-fold
    /// tables. Cheap because the diagnoses table is small (master data)
    /// and grows linearly with hand-curated terms, not record volume.
    async fn find_by_name_case_insensitive(
        pool: &SeaOrmPool,
        name: &str,
    ) -> Result<Option<i64>, String> {
        let target = name.to_lowercase();
        let rows = pool
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, name FROM diagnoses".to_string(),
            ))
            .await
            .map_err(|e| format!("find_by_name_case_insensitive: {}", e))?;

        for row in rows {
            let row_name: String = row
                .try_get("", "name")
                .map_err(|e| format!("name: {}", e))?;
            if row_name.to_lowercase() == target {
                let id: i64 = row.try_get("", "id").map_err(|e| format!("id: {}", e))?;
                return Ok(Some(id));
            }
        }
        Ok(None)
    }

    pub async fn update(
        pool: &SeaOrmPool,
        id: i64,
        input: UpdateDiagnosisInput,
    ) -> Result<Diagnosis, String> {
        let mut sets: Vec<&'static str> = Vec::new();
        let mut values: Vec<sea_orm::Value> = Vec::new();

        if let Some(name) = input.name {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                return Err("Diagnosis name cannot be empty".into());
            }
            // Codepoint count, not byte count — see comment in `create`.
            if trimmed.chars().count() > 100 {
                return Err("Diagnosis name must be 100 characters or fewer".into());
            }
            // Unicode-aware dedup — see `find_by_name_case_insensitive`.
            // Exclude the row being updated so it's not flagged as a
            // self-conflict.
            if let Some(existing_id) = Self::find_by_name_case_insensitive(pool, trimmed).await? {
                if existing_id != id {
                    return Err("A diagnosis with this name already exists".to_string());
                }
            }
            sets.push("name = ?");
            values.push(trimmed.to_string().into());
        }
        if let Some(description) = input.description {
            let trimmed = description.trim();
            sets.push("description = ?");
            values.push(if trimmed.is_empty() {
                sea_orm::Value::String(None)
            } else {
                trimmed.to_string().into()
            });
        }
        if let Some(color) = input.color {
            let trimmed = color.trim();
            sets.push("color = ?");
            values.push(if trimmed.is_empty() {
                sea_orm::Value::String(None)
            } else {
                trimmed.to_string().into()
            });
        }
        if let Some(is_active) = input.is_active {
            sets.push("is_active = ?");
            values.push((if is_active { 1i64 } else { 0i64 }).into());
        }

        if sets.is_empty() {
            return Self::get_by_id(pool, id).await;
        }

        values.push(id.into());
        let sql = format!("UPDATE diagnoses SET {} WHERE id = ?", sets.join(", "));

        pool.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, values))
            .await
            .map_err(|e| {
                if e.to_string().contains("UNIQUE") {
                    "A diagnosis with this name already exists".to_string()
                } else {
                    format!("update_diagnosis: {}", e)
                }
            })?;

        Self::get_by_id(pool, id).await
    }

    /// Soft-delete via `is_active = 0`. The diagnosis stays in the
    /// table so historical record→diagnosis links remain pointable.
    pub async fn deactivate(pool: &SeaOrmPool, id: i64) -> Result<(), String> {
        pool.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE diagnoses SET is_active = 0 WHERE id = ?",
            vec![id.into()],
        ))
        .await
        .map_err(|e| format!("deactivate_diagnosis: {}", e))?;
        Ok(())
    }

    /// Hard delete — only succeeds if the diagnosis isn't linked to
    /// any medical records (ON DELETE RESTRICT on the FK). The UI
    /// should normally call `deactivate` instead and only expose
    /// hard-delete behind an explicit confirm.
    pub async fn hard_delete(pool: &SeaOrmPool, id: i64) -> Result<(), String> {
        pool.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM diagnoses WHERE id = ?",
            vec![id.into()],
        ))
        .await
        .map_err(|e| {
            if e.to_string().contains("FOREIGN KEY") {
                "Cannot delete: this diagnosis is linked to one or more medical records. \
                 Deactivate it instead to hide it from the picker while keeping history."
                    .to_string()
            } else {
                format!("delete_diagnosis: {}", e)
            }
        })?;
        Ok(())
    }

    // ---------------------------------------------------------------
    // medical_record_diagnoses junction-table helpers
    // ---------------------------------------------------------------

    /// Return every distinct diagnosis ever applied to any of the
    /// patient's medical records, ordered by name. Used by the
    /// patient detail overview tab to show a "history at a glance"
    /// tag list — recurring diagnoses appear only once.
    ///
    /// Includes inactive diagnoses (just like list_for_record) so
    /// historical conditions aren't hidden when the user later
    /// retires a tag from the picker.
    pub async fn list_for_patient(
        pool: &SeaOrmPool,
        patient_id: i64,
    ) -> Result<Vec<Diagnosis>, String> {
        let rows = pool
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT DISTINCT d.id, d.name, d.description, d.color, d.is_active, d.created_at, d.updated_at \
                 FROM diagnoses d \
                 INNER JOIN medical_record_diagnoses mrd ON mrd.diagnosis_id = d.id \
                 INNER JOIN medical_records mr ON mr.id = mrd.medical_record_id \
                 WHERE mr.patient_id = ? \
                 ORDER BY d.name COLLATE NOCASE ASC",
                vec![patient_id.into()],
            ))
            .await
            .map_err(|e| format!("list_diagnoses_for_patient: {}", e))?;

        rows.iter().map(row_to_model).collect()
    }

    /// Return every diagnosis attached to the given medical record.
    /// Includes inactive diagnoses so historical records still show
    /// their full original tag set.
    pub async fn list_for_record(
        pool: &SeaOrmPool,
        medical_record_id: i64,
    ) -> Result<Vec<Diagnosis>, String> {
        let rows = pool
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT d.id, d.name, d.description, d.color, d.is_active, d.created_at, d.updated_at \
                 FROM diagnoses d \
                 INNER JOIN medical_record_diagnoses mrd ON mrd.diagnosis_id = d.id \
                 WHERE mrd.medical_record_id = ? \
                 ORDER BY d.name COLLATE NOCASE ASC",
                vec![medical_record_id.into()],
            ))
            .await
            .map_err(|e| format!("list_diagnoses_for_record: {}", e))?;

        rows.iter().map(row_to_model).collect()
    }

    /// Replace the diagnosis set of `medical_record_id` with exactly
    /// `diagnosis_ids`. Idempotent — no-op if the current set already
    /// matches. Implemented as DELETE + INSERT inside a transaction so
    /// callers never see a half-updated state.
    pub async fn set_for_record(
        pool: &SeaOrmPool,
        medical_record_id: i64,
        diagnosis_ids: &[i64],
    ) -> Result<(), String> {
        // Naive approach — fine for the small N (a medical record
        // typically has 0-5 diagnoses). If we ever start applying
        // hundreds of diagnoses we'd switch to compute-the-diff +
        // batched inserts.
        let txn = pool
            .begin()
            .await
            .map_err(|e| format!("set_diagnoses_for_record begin: {}", e))?;

        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM medical_record_diagnoses WHERE medical_record_id = ?",
            vec![medical_record_id.into()],
        ))
        .await
        .map_err(|e| format!("set_diagnoses_for_record clear: {}", e))?;

        for diagnosis_id in diagnosis_ids {
            txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO medical_record_diagnoses (medical_record_id, diagnosis_id) VALUES (?, ?)",
                vec![medical_record_id.into(), (*diagnosis_id).into()],
            ))
            .await
            .map_err(|e| format!("set_diagnoses_for_record insert: {}", e))?;
        }

        txn.commit()
            .await
            .map_err(|e| format!("set_diagnoses_for_record commit: {}", e))?;

        Ok(())
    }
}

fn row_to_model(row: &QueryResult) -> Result<Diagnosis, String> {
    let created_at_str: String = row
        .try_get("", "created_at")
        .map_err(|e| format!("created_at: {}", e))?;
    let updated_at_str: String = row
        .try_get("", "updated_at")
        .map_err(|e| format!("updated_at: {}", e))?;

    Ok(Diagnosis {
        id: row.try_get("", "id").map_err(|e| format!("id: {}", e))?,
        name: row.try_get("", "name").map_err(|e| format!("name: {}", e))?,
        description: row.try_get("", "description").ok(),
        color: row.try_get("", "color").ok(),
        is_active: row
            .try_get::<i64>("", "is_active")
            .map_err(|e| format!("is_active: {}", e))?
            != 0,
        created_at: parse_sqlite_datetime(&created_at_str),
        updated_at: parse_sqlite_datetime(&updated_at_str),
    })
}

/// SQLite's CURRENT_TIMESTAMP format is `YYYY-MM-DD HH:MM:SS` without a
/// timezone — assume UTC (which is what CURRENT_TIMESTAMP returns).
fn parse_sqlite_datetime(s: &str) -> DateTime<Utc> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S"))
        .map(|ndt| ndt.and_utc())
        .unwrap_or_else(|_| Utc::now())
}
