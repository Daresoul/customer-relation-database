use crate::entities::patient::{self, Entity as PatientEntity};
use crate::models::{Patient, CreatePatientDto, UpdatePatientDto};
use crate::models::dto::MaybeNull;
use chrono::Utc;
use sea_orm::*;

pub struct PatientService;

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
        })
    }

    pub async fn get_all(db: &DatabaseConnection) -> Result<Vec<Patient>, String> {
        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                r#"SELECT
                    p.id,
                    p.name,
                    p.species_id,
                    p.breed_id,
                    s.name as species,
                    b.name as breed,
                    p.gender,
                    p.date_of_birth,
                    p.color,
                    CAST(p.weight AS REAL) as weight,
                    p.microchip_id,
                    p.medical_notes,
                    p.is_active,
                    ph.household_id,
                    p.created_at,
                    p.updated_at
                 FROM patients p
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN breeds b ON p.breed_id = b.id
                 LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
                 ORDER BY p.created_at DESC"#.to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to fetch patients: {}", e))?;

        rows.iter()
            .map(Self::row_to_patient)
            .collect()
    }

    pub async fn get_by_id(db: &DatabaseConnection, id: i64) -> Result<Option<Patient>, String> {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"SELECT
                    p.id,
                    p.name,
                    p.species_id,
                    p.breed_id,
                    s.name as species,
                    b.name as breed,
                    p.gender,
                    p.date_of_birth,
                    p.color,
                    CAST(p.weight AS REAL) as weight,
                    p.microchip_id,
                    p.medical_notes,
                    p.is_active,
                    ph.household_id,
                    p.created_at,
                    p.updated_at
                 FROM patients p
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN breeds b ON p.breed_id = b.id
                 LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
                 WHERE p.id = ?"#,
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        match row {
            Some(r) => Ok(Some(Self::row_to_patient(&r)?)),
            None => Ok(None),
        }
    }

    pub async fn create(db: &DatabaseConnection, dto: CreatePatientDto) -> Result<Patient, String> {
        // Normalize empty strings to None so the DB stores NULL rather than ""
        let name = dto.name.as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let microchip_id = dto.microchip_id.as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

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
                "SELECT id FROM patients WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        if exists.is_none() {
            return Ok(None);
        }

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
            MaybeNull::Value(v) => {
                set_clauses.push("microchip_id = ?".to_string());
                params.push(v.into());
            },
        }

        if let Some(is_active) = dto.is_active {
            set_clauses.push("is_active = ?".to_string());
            params.push((if is_active { 1i64 } else { 0i64 }).into());
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

        db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, params))
            .await
            .map_err(|e| format!("Failed to update patient: {}", e))?;

        Self::get_by_id(db, id).await
    }

    pub async fn delete(db: &DatabaseConnection, id: i64) -> Result<bool, String> {
        let result = PatientEntity::delete_by_id(id)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to delete patient: {}", e))?;

        Ok(result.rows_affected > 0)
    }

    pub async fn get_by_species(db: &DatabaseConnection, species: &str) -> Result<Vec<Patient>, String> {
        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"SELECT
                    p.id,
                    p.name,
                    p.species_id,
                    p.breed_id,
                    s.name as species,
                    b.name as breed,
                    p.gender,
                    p.date_of_birth,
                    p.color,
                    CAST(p.weight AS REAL) as weight,
                    p.microchip_id,
                    p.medical_notes,
                    p.is_active,
                    ph.household_id,
                    p.created_at,
                    p.updated_at
                 FROM patients p
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN breeds b ON p.breed_id = b.id
                 LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
                 WHERE s.name = ?
                 ORDER BY p.name"#,
                [species.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch patients by species: {}", e))?;

        rows.iter()
            .map(Self::row_to_patient)
            .collect()
    }

    pub async fn search(db: &DatabaseConnection, query: &str) -> Result<Vec<Patient>, String> {
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
                r#"SELECT
                    p.id,
                    p.name,
                    p.species_id,
                    p.breed_id,
                    s.name as species,
                    b.name as breed,
                    p.gender,
                    p.date_of_birth,
                    p.color,
                    CAST(p.weight AS REAL) as weight,
                    p.microchip_id,
                    p.medical_notes,
                    p.is_active,
                    ph.household_id,
                    p.created_at,
                    p.updated_at
                 FROM patients p
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN breeds b ON p.breed_id = b.id
                 LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1"#
                    .to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to search patients: {}", e))?;

        let mut matched: Vec<Patient> = rows
            .iter()
            .filter_map(|r| Self::row_to_patient(r).ok())
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
        Ok(matched)
    }

    pub async fn advanced_search(
        db: &DatabaseConnection,
        patient_name: Option<&str>,
        species: Option<&str>,
    ) -> Result<Vec<Patient>, String> {
        // Same Cyrillic-safe approach as search(): fetch then filter in
        // Rust with to_lowercase() instead of ASCII-only SQL LIKE. Both
        // filters (name + species) are optional and ANDed.
        let name_needle = patient_name
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());
        let species_needle = species
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());

        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                r#"SELECT
                    p.id,
                    p.name,
                    p.species_id,
                    p.breed_id,
                    s.name as species,
                    b.name as breed,
                    p.gender,
                    p.date_of_birth,
                    p.color,
                    CAST(p.weight AS REAL) as weight,
                    p.microchip_id,
                    p.medical_notes,
                    p.is_active,
                    ph.household_id,
                    p.created_at,
                    p.updated_at
                 FROM patients p
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN breeds b ON p.breed_id = b.id
                 LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1"#
                    .to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to search patients: {}", e))?;

        let mut matched: Vec<Patient> = rows
            .iter()
            .filter_map(|r| Self::row_to_patient(r).ok())
            .filter(|p| {
                let name_ok = match &name_needle {
                    Some(n) => p
                        .name
                        .as_deref()
                        .is_some_and(|v| v.to_lowercase().contains(n)),
                    None => true,
                };
                let species_ok = match &species_needle {
                    Some(s) => p
                        .species
                        .as_deref()
                        .is_some_and(|v| v.to_lowercase().contains(s)),
                    None => true,
                };
                name_ok && species_ok
            })
            .collect();

        matched.sort_by(|a, b| {
            a.name
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .cmp(&b.name.as_deref().unwrap_or("").to_lowercase())
        });
        matched.truncate(100);
        Ok(matched)
    }
}
