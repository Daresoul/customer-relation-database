use crate::entities::patient::{self, Entity as PatientEntity};
use crate::models::{Patient, PatientAlert, PatientWeight, CreatePatientDto, UpdatePatientDto};
use crate::models::patient::ALERT_TYPES;
use crate::models::dto::MaybeNull;
use chrono::{NaiveDate, Utc};
use sea_orm::*;

pub struct PatientService;

/// Stored form of a typed or scanned chip: no spaces or dashes, and a 12-hex
/// FDX-B read as its 15-digit number (what scanners emit). `None` when blank.
pub fn normalize_microchip(raw: &str) -> Option<String> {
    let compact: String = raw.chars().filter(|c| !c.is_whitespace() && *c != '-').collect();
    if compact.is_empty() {
        None
    } else {
        Some(crate::services::device_capture::normalize_microchip_public(&compact))
    }
}

/// Refuses a chip that another active patient already has. Enforced here, not
/// by a UNIQUE index, so clinic DBs that already hold duplicates still load.
pub(crate) async fn ensure_chip_free(db: &DatabaseConnection, chip: &str, own_id: Option<i64>) -> Result<(), String> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, name FROM patients \
             WHERE REPLACE(REPLACE(microchip_id, ' ', ''), '-', '') = ? \
               AND is_active = 1 AND id != ? \
             ORDER BY id LIMIT 1",
            [chip.into(), own_id.unwrap_or(-1).into()],
        ))
        .await
        .map_err(|e| format!("Failed to check microchip: {}", e))?;

    match row {
        None => Ok(()),
        Some(r) => {
            let id: i64 = r.try_get("", "id").unwrap_or_default();
            let name = r
                .try_get::<Option<String>>("", "name")
                .ok()
                .flatten()
                .unwrap_or_else(|| format!("#{}", id));
            Err(format!("Microchip {} is already registered to another patient: {}", chip, name))
        }
    }
}

const ALERT_NOTE_MAX: usize = 200;

/// Every patient read goes through this, so all of them carry the same fields.
const PATIENT_SELECT: &str = "SELECT p.id, p.name, p.species_id, p.breed_id, s.name AS species, b.name AS breed, \
    p.gender, p.date_of_birth, p.color, CAST(p.weight AS REAL) AS weight, p.microchip_id, p.medical_notes, \
    p.is_active, ph.household_id, p.created_at, p.updated_at, \
    p.neutered, p.deceased_at, p.deceased_note, p.inactive_reason, \
    (SELECT w.measured_on FROM patient_weights w WHERE w.patient_id = p.id \
     ORDER BY w.measured_on DESC, w.id DESC LIMIT 1) AS last_weight_at \
    FROM patients p \
    LEFT JOIN species s ON p.species_id = s.id \
    LEFT JOIN breeds b ON p.breed_id = b.id \
    LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1";

/// Trimmed; blank becomes `None`.
fn clean_text(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

impl PatientService {
    /// Helper to convert a raw query row to a Patient model
    fn row_to_patient(row: &QueryResult) -> Result<Patient, String> {
        Ok(Patient {
            id: row.try_get("", "id").map_err(|e| e.to_string())?,
            name: row.try_get("", "name").ok(),
            species_id: row.try_get("", "species_id").ok(),
            breed_id: row.try_get("", "breed_id").ok(),
            species: row.try_get("", "species").ok(),
            breed: row.try_get("", "breed").ok(),
            gender: row.try_get("", "gender").ok(),
            date_of_birth: row.try_get("", "date_of_birth").ok(),
            color: row.try_get("", "color").ok(),
            weight: row.try_get("", "weight").ok(),
            microchip_id: row.try_get("", "microchip_id").ok(),
            medical_notes: row.try_get("", "medical_notes").ok(),
            is_active: row.try_get::<i64>("", "is_active").map(|v| v == 1).unwrap_or(true),
            household_id: row.try_get("", "household_id").ok(),
            created_at: row.try_get("", "created_at").map_err(|e| e.to_string())?,
            updated_at: row.try_get("", "updated_at").map_err(|e| e.to_string())?,
            neutered: row.try_get::<Option<i64>>("", "neutered").ok().flatten().map(|v| v == 1),
            deceased_at: row.try_get("", "deceased_at").ok().flatten(),
            deceased_note: row.try_get("", "deceased_note").ok().flatten(),
            inactive_reason: row.try_get("", "inactive_reason").ok().flatten(),
            last_weight_at: row.try_get("", "last_weight_at").ok().flatten(),
            alerts: Vec::new(),
        })
    }

    fn row_to_alert(row: &QueryResult) -> Result<PatientAlert, String> {
        Ok(PatientAlert {
            id: row.try_get("", "id").map_err(|e| e.to_string())?,
            patient_id: row.try_get("", "patient_id").map_err(|e| e.to_string())?,
            alert_type: row.try_get("", "alert_type").map_err(|e| e.to_string())?,
            note: row.try_get("", "note").ok().flatten(),
            created_at: row.try_get::<String>("", "created_at").unwrap_or_default(),
        })
    }

    fn row_to_weight(row: &QueryResult) -> Result<PatientWeight, String> {
        Ok(PatientWeight {
            id: row.try_get("", "id").map_err(|e| e.to_string())?,
            patient_id: row.try_get("", "patient_id").map_err(|e| e.to_string())?,
            weight: row.try_get("", "weight").map_err(|e| e.to_string())?,
            measured_on: row.try_get("", "measured_on").map_err(|e| e.to_string())?,
            medical_record_id: row.try_get("", "medical_record_id").ok().flatten(),
        })
    }

    /// Fills `alerts` on each patient with one query.
    async fn attach_alerts(db: &DatabaseConnection, patients: &mut [Patient]) -> Result<(), String> {
        if patients.is_empty() {
            return Ok(());
        }
        let rows = if patients.len() == 1 {
            db.query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, alert_type, note, created_at FROM patient_alerts WHERE patient_id = ? ORDER BY id",
                [patients[0].id.into()],
            ))
            .await
        } else {
            db.query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, patient_id, alert_type, note, created_at FROM patient_alerts ORDER BY id".to_string(),
            ))
            .await
        }
        .map_err(|e| format!("Failed to fetch patient alerts: {}", e))?;

        let mut by_patient: std::collections::HashMap<i64, Vec<PatientAlert>> = std::collections::HashMap::new();
        for row in &rows {
            let alert = Self::row_to_alert(row)?;
            by_patient.entry(alert.patient_id).or_default().push(alert);
        }
        for p in patients.iter_mut() {
            p.alerts = by_patient.remove(&p.id).unwrap_or_default();
        }
        Ok(())
    }

    async fn patients_with_alerts(db: &DatabaseConnection, rows: &[QueryResult]) -> Result<Vec<Patient>, String> {
        let mut patients = rows.iter().map(Self::row_to_patient).collect::<Result<Vec<_>, _>>()?;
        Self::attach_alerts(db, &mut patients).await?;
        Ok(patients)
    }

    async fn exec_on_patient(db: &DatabaseConnection, id: i64, sql: &str, mut values: Vec<Value>) -> Result<Option<Patient>, String> {
        values.push(Utc::now().to_rfc3339().into());
        values.push(id.into());
        let result = db
            .execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, values))
            .await
            .map_err(|e| format!("Failed to update patient: {}", e))?;
        if result.rows_affected() == 0 {
            return Ok(None);
        }
        Self::get_by_id(db, id).await
    }

    /// Keeps the chart; hides the patient from lists, pickers and booking.
    pub async fn mark_deceased(db: &DatabaseConnection, id: i64, on: NaiveDate, note: Option<String>) -> Result<Option<Patient>, String> {
        if on > chrono::Local::now().date_naive() {
            return Err("DECEASED_DATE_IN_FUTURE: the date of death can't be after today".to_string());
        }
        Self::exec_on_patient(
            db,
            id,
            "UPDATE patients SET is_active = 0, deceased_at = ?, deceased_note = ?, inactive_reason = NULL, updated_at = ? WHERE id = ?",
            vec![on.format("%Y-%m-%d").to_string().into(), clean_text(note).into()],
        )
        .await
    }

    pub async fn mark_inactive(db: &DatabaseConnection, id: i64, reason: Option<String>) -> Result<Option<Patient>, String> {
        Self::exec_on_patient(
            db,
            id,
            "UPDATE patients SET is_active = 0, inactive_reason = ?, deceased_at = NULL, deceased_note = NULL, updated_at = ? WHERE id = ?",
            vec![clean_text(reason).into()],
        )
        .await
    }

    pub async fn reactivate(db: &DatabaseConnection, id: i64) -> Result<Option<Patient>, String> {
        let Some(existing) = Self::get_by_id(db, id).await? else {
            return Ok(None);
        };
        if let Some(chip) = existing.microchip_id.as_deref().and_then(normalize_microchip) {
            ensure_chip_free(db, &chip, Some(id)).await?;
        }
        Self::exec_on_patient(
            db,
            id,
            "UPDATE patients SET is_active = 1, deceased_at = NULL, deceased_note = NULL, inactive_reason = NULL, updated_at = ? WHERE id = ?",
            vec![],
        )
        .await
    }

    fn checked_alert(alert_type: &str, note: Option<String>) -> Result<(String, Option<String>), String> {
        if !ALERT_TYPES.contains(&alert_type) {
            return Err(format!("INVALID_ALERT_TYPE: {}", alert_type));
        }
        let note = clean_text(note);
        if note.as_ref().is_some_and(|n| n.chars().count() > ALERT_NOTE_MAX) {
            return Err(format!("ALERT_NOTE_TOO_LONG: at most {} characters", ALERT_NOTE_MAX));
        }
        Ok((alert_type.to_string(), note))
    }

    async fn get_alert(db: &DatabaseConnection, id: i64) -> Result<PatientAlert, String> {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, alert_type, note, created_at FROM patient_alerts WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch alert: {}", e))?
            .ok_or_else(|| "ALERT_NOT_FOUND".to_string())?;
        Self::row_to_alert(&row)
    }

    pub async fn add_alert(db: &DatabaseConnection, patient_id: i64, alert_type: &str, note: Option<String>) -> Result<PatientAlert, String> {
        let (alert_type, note) = Self::checked_alert(alert_type, note)?;
        let result = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO patient_alerts (patient_id, alert_type, note) VALUES (?, ?, ?)",
                [patient_id.into(), alert_type.into(), note.into()],
            ))
            .await
            .map_err(|e| format!("Failed to add alert: {}", e))?;
        Self::get_alert(db, result.last_insert_id() as i64).await
    }

    pub async fn update_alert(db: &DatabaseConnection, id: i64, alert_type: &str, note: Option<String>) -> Result<PatientAlert, String> {
        let (alert_type, note) = Self::checked_alert(alert_type, note)?;
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE patient_alerts SET alert_type = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [alert_type.into(), note.into(), id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to update alert: {}", e))?;
        Self::get_alert(db, id).await
    }

    pub async fn delete_alert(db: &DatabaseConnection, id: i64) -> Result<bool, String> {
        let result = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "DELETE FROM patient_alerts WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to delete alert: {}", e))?;
        Ok(result.rows_affected() > 0)
    }

    /// Points `patients.weight` at the newest log entry (NULL when the log is empty).
    async fn sync_latest_weight<C: ConnectionTrait>(db: &C, patient_id: i64) -> Result<(), String> {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE patients SET weight = (SELECT w.weight FROM patient_weights w WHERE w.patient_id = ? \
             ORDER BY w.measured_on DESC, w.id DESC LIMIT 1) WHERE id = ?",
            [patient_id.into(), patient_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to update the latest weight: {}", e))?;
        Ok(())
    }

    async fn insert_weight<C: ConnectionTrait>(db: &C, patient_id: i64, weight: f64, on: NaiveDate, record_id: Option<i64>) -> Result<i64, String> {
        if !(weight > 0.0) {
            return Err("INVALID_WEIGHT: the weight must be more than 0".to_string());
        }
        let result = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO patient_weights (patient_id, weight, measured_on, medical_record_id) VALUES (?, ?, ?, ?)",
                [patient_id.into(), weight.into(), on.format("%Y-%m-%d").to_string().into(), record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to add weight: {}", e))?;
        Self::sync_latest_weight(db, patient_id).await?;
        Ok(result.last_insert_id() as i64)
    }

    pub async fn add_weight(db: &DatabaseConnection, patient_id: i64, weight: f64, on: NaiveDate, record_id: Option<i64>) -> Result<PatientWeight, String> {
        let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;
        let id = Self::insert_weight(&txn, patient_id, weight, on, record_id).await?;
        txn.commit().await.map_err(|e| format!("Failed to save weight: {}", e))?;

        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, weight, measured_on, medical_record_id FROM patient_weights WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch weight: {}", e))?
            .ok_or_else(|| "Failed to fetch the saved weight".to_string())?;
        Self::row_to_weight(&row)
    }

    /// Newest first.
    pub async fn list_weights(db: &DatabaseConnection, patient_id: i64) -> Result<Vec<PatientWeight>, String> {
        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, weight, measured_on, medical_record_id FROM patient_weights \
                 WHERE patient_id = ? ORDER BY measured_on DESC, id DESC",
                [patient_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch weights: {}", e))?;
        rows.iter().map(Self::row_to_weight).collect()
    }

    pub async fn delete_weight(db: &DatabaseConnection, id: i64) -> Result<bool, String> {
        let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;
        let owner = txn
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT patient_id FROM patient_weights WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch weight: {}", e))?;
        let Some(owner) = owner else {
            return Ok(false);
        };
        let patient_id: i64 = owner.try_get("", "patient_id").map_err(|e| e.to_string())?;
        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM patient_weights WHERE id = ?",
            [id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to delete weight: {}", e))?;
        Self::sync_latest_weight(&txn, patient_id).await?;
        txn.commit().await.map_err(|e| format!("Failed to delete weight: {}", e))?;
        Ok(true)
    }

    pub async fn get_all(db: &DatabaseConnection) -> Result<Vec<Patient>, String> {
        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                format!("{} {}", PATIENT_SELECT, "ORDER BY p.created_at DESC"),
            ))
            .await
            .map_err(|e| format!("Failed to fetch patients: {}", e))?;

        Self::patients_with_alerts(db, &rows).await
    }

    pub async fn get_by_id(db: &DatabaseConnection, id: i64) -> Result<Option<Patient>, String> {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &format!("{} {}", PATIENT_SELECT, "WHERE p.id = ?"),
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        match row {
            Some(r) => Ok(Self::patients_with_alerts(db, std::slice::from_ref(&r)).await?.pop()),
            None => Ok(None),
        }
    }

    pub async fn create(db: &DatabaseConnection, dto: CreatePatientDto) -> Result<Patient, String> {
        // Normalize empty strings to None so the DB stores NULL rather than ""
        let name = dto.name.as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let microchip_id = dto.microchip_id.as_deref().and_then(normalize_microchip);
        if let Some(chip) = &microchip_id {
            ensure_chip_free(db, chip, None).await?;
        }

        // Require at least some way to identify the patient. The frontend
        // enforces this too, but defend against API misuse.
        if name.is_none() && microchip_id.is_none() {
            return Err("Patient must have either a name or a microchip ID".to_string());
        }

        log::info!("🐾 Creating patient: name={:?}, species_id={:?}, breed_id={:?}, gender={:?}",
            name, dto.species_id, dto.breed_id, dto.gender);

        let now = Utc::now();

        // Insert the patient using SeaORM. Use the normalized name/microchip
        // values (empty/whitespace → None) so we don't store "" rows.
        let new_patient = patient::ActiveModel {
            name: Set(name),
            species_id: Set(dto.species_id),
            breed_id: Set(dto.breed_id),
            gender: Set(dto.gender),
            date_of_birth: Set(dto.date_of_birth),
            color: Set(dto.color),
            weight: Set(dto.weight),
            microchip_id: Set(microchip_id),
            medical_notes: Set(dto.medical_notes),
            is_active: Set(true),
            household_id: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };

        // Wrap the patient INSERT and the optional patient_households link
        // in a single transaction. Previously these were two separate
        // statements: if the household link failed (e.g. a bad household_id
        // FK), the patient row was already committed, leaving an orphaned
        // patient that wasn't attached to the household the caller asked
        // for. The transaction makes it all-or-nothing.
        let txn = db
            .begin()
            .await
            .map_err(|e| format!("Failed to begin transaction: {}", e))?;

        let result = PatientEntity::insert(new_patient)
            .exec(&txn)
            .await
            .map_err(|e| {
                log::error!("❌ Failed to insert patient: {}", e);
                format!("Failed to create patient: {}", e)
            })?;

        let patient_id = result.last_insert_id;

        // If household_id is provided, create the relationship
        if let Some(household_id) = dto.household_id {
            txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary) VALUES (?, ?, 'Pet', 1)",
                [patient_id.into(), household_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to create household relationship: {}", e))?;
        }

        if let Some(weight) = dto.weight {
            Self::insert_weight(&txn, patient_id, weight, chrono::Local::now().date_naive(), None).await?;
        }

        txn.commit()
            .await
            .map_err(|e| format!("Failed to commit patient create: {}", e))?;

        Self::get_by_id(db, patient_id)
            .await?
            .ok_or_else(|| "Failed to fetch created patient".to_string())
    }

    pub async fn update(db: &DatabaseConnection, id: i64, dto: UpdatePatientDto) -> Result<Option<Patient>, String> {
        // Check if patient exists
        let exists = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, microchip_id FROM patients WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        let Some(existing) = exists else {
            return Ok(None);
        };
        let current_chip = existing
            .try_get::<Option<String>>("", "microchip_id")
            .ok()
            .flatten()
            .and_then(|c| normalize_microchip(&c));

        // Build dynamic UPDATE query
        let mut set_clauses: Vec<String> = Vec::new();
        let mut params: Vec<Value> = Vec::new();

        if let Some(name) = dto.name {
            set_clauses.push("name = ?".to_string());
            params.push(name.into());
        }

        // Migration 041 made species_id nullable so chip-only patients can
        // exist without a species. Honor MaybeNull::Null as "set to NULL".
        match dto.species_id {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("species_id = NULL".to_string());
            },
            MaybeNull::Value(v) => {
                set_clauses.push("species_id = ?".to_string());
                params.push(v.into());
            },
        }

        match dto.breed_id {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("breed_id = NULL".to_string());
            },
            MaybeNull::Value(v) => {
                set_clauses.push("breed_id = ?".to_string());
                params.push(v.into());
            },
        }

        match dto.gender {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("gender = NULL".to_string());
            },
            MaybeNull::Value(v) => {
                set_clauses.push("gender = ?".to_string());
                params.push(v.into());
            },
        }

        match dto.date_of_birth {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("date_of_birth = NULL".to_string());
            },
            MaybeNull::Value(v) => {
                set_clauses.push("date_of_birth = ?".to_string());
                params.push(v.into());
            },
        }

        let logged_weight = match dto.weight {
            MaybeNull::Value(v) => Some(v),
            _ => None,
        };
        match dto.weight {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("weight = NULL".to_string());
            },
            MaybeNull::Value(v) => {
                // Cast to REAL to ensure proper SQLite type storage
                set_clauses.push("weight = CAST(? AS REAL)".to_string());
                params.push(v.into());
            },
        }

        match dto.medical_notes {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("medical_notes = NULL".to_string());
            },
            MaybeNull::Value(v) => {
                set_clauses.push("medical_notes = ?".to_string());
                params.push(v.into());
            },
        }

        match dto.color {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("color = NULL".to_string());
            },
            MaybeNull::Value(v) => {
                set_clauses.push("color = ?".to_string());
                params.push(v.into());
            },
        }

        match dto.microchip_id {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                set_clauses.push("microchip_id = NULL".to_string());
            },
            MaybeNull::Value(v) => match normalize_microchip(&v) {
                None => set_clauses.push("microchip_id = NULL".to_string()),
                Some(chip) => {
                    if current_chip.as_deref() != Some(chip.as_str()) {
                        ensure_chip_free(db, &chip, Some(id)).await?;
                    }
                    set_clauses.push("microchip_id = ?".to_string());
                    params.push(chip.into());
                }
            },
        }

        if let Some(is_active) = dto.is_active {
            set_clauses.push("is_active = ?".to_string());
            params.push((if is_active { 1i64 } else { 0i64 }).into());
        }

        match dto.neutered {
            MaybeNull::Undefined => {},
            MaybeNull::Null => set_clauses.push("neutered = NULL".to_string()),
            MaybeNull::Value(v) => {
                set_clauses.push("neutered = ?".to_string());
                params.push((if v { 1i64 } else { 0i64 }).into());
            },
        }

        if set_clauses.is_empty() {
            return Self::get_by_id(db, id).await;
        }

        // Always update updated_at
        set_clauses.push("updated_at = ?".to_string());
        params.push(Utc::now().to_rfc3339().into());

        // Add id for WHERE clause
        params.push(id.into());

        let sql = format!(
            "UPDATE patients SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;
        txn.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, params))
            .await
            .map_err(|e| format!("Failed to update patient: {}", e))?;
        if let Some(weight) = logged_weight {
            Self::insert_weight(&txn, id, weight, chrono::Local::now().date_naive(), None).await?;
        }
        txn.commit().await.map_err(|e| format!("Failed to update patient: {}", e))?;

        Self::get_by_id(db, id).await
    }

    /// Hard delete, only for a patient with no history. Records (and the
    /// invoices on them) and appointments would cascade away with the row.
    pub async fn delete(db: &DatabaseConnection, id: i64) -> Result<bool, String> {
        let history = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT \
                   (SELECT COUNT(*) FROM medical_records WHERE patient_id = ?) AS records, \
                   (SELECT COUNT(*) FROM appointments WHERE patient_id = ? AND deleted_at IS NULL) AS appointments",
                [id.into(), id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to check patient history: {}", e))?;
        let (records, appointments) = history
            .map(|r| {
                (
                    r.try_get::<i64>("", "records").unwrap_or(0),
                    r.try_get::<i64>("", "appointments").unwrap_or(0),
                )
            })
            .unwrap_or((0, 0));
        if records > 0 || appointments > 0 {
            return Err(format!(
                "PATIENT_HAS_HISTORY: {} medical records, {} appointments",
                records, appointments
            ));
        }

        let result = PatientEntity::delete_by_id(id)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to delete patient: {}", e))?;

        Ok(result.rows_affected > 0)
    }

    /// Active patients only; see `search_including_inactive`.
    pub async fn search(db: &DatabaseConnection, query: &str) -> Result<Vec<Patient>, String> {
        Self::search_including_inactive(db, query, false).await
    }

    /// Inactive and deceased patients are left out unless `include_inactive`.
    pub async fn search_including_inactive(db: &DatabaseConnection, query: &str, include_inactive: bool) -> Result<Vec<Patient>, String> {
        // SQLite's LIKE (and LOWER()) only case-fold ASCII a-z/A-Z, so a
        // search for "ана" would NOT match the stored "Ана" for Macedonian
        // Cyrillic names. Fetch the candidate set and filter in Rust with
        // Unicode-aware String::to_lowercase(). The patients table is
        // single-clinic scale (low thousands at most), so the full scan is
        // cheap — correctness beats a faster-but-wrong ASCII LIKE here.
        // Bonus: dropping LIKE also removes the `%`/`_` wildcard-injection
        // quirk where a query containing those chars behaved oddly.
        // Empty query lists everyone (preserves the old `LIKE '%%'`
        // behaviour the UI relies on for "show all").
        let needle = query.trim().to_lowercase();

        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                PATIENT_SELECT.to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to search patients: {}", e))?;

        let mut unreadable = 0usize;
        let readable: Vec<Patient> = rows
            .iter()
            .filter_map(|r| {
                Self::row_to_patient(r)
                    .map_err(|e| {
                        unreadable += 1;
                        log::warn!("A patient row can't be read and is left out of the search: {}", e);
                    })
                    .ok()
            })
            .collect();
        if unreadable > 0 {
            log::warn!("{} of {} patient rows left out of the search", unreadable, rows.len());
        }
        let mut matched: Vec<Patient> = readable
            .into_iter()
            .filter(|p| include_inactive || p.is_active)
            .filter(|p| {
                if needle.is_empty() {
                    return true;
                }
                let name_hit = p
                    .name
                    .as_deref()
                    .is_some_and(|n| n.to_lowercase().contains(&needle));
                let chip_hit = p
                    .microchip_id
                    .as_deref()
                    .is_some_and(|m| m.to_lowercase().contains(&needle));
                name_hit || chip_hit
            })
            .collect();

        // Stable, case-insensitive ordering by name.
        matched.sort_by(|a, b| {
            a.name
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .cmp(&b.name.as_deref().unwrap_or("").to_lowercase())
        });
        matched.truncate(50);
        Self::attach_alerts(db, &mut matched).await?;
        Ok(matched)
    }

}
