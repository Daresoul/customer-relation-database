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
            name: row.try_get("", "name").map_err(|e| e.to_string())?,
            species_id: row.try_get("", "species_id").map_err(|e| e.to_string())?,
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
        log::info!("🐾 Creating patient: name={}, species_id={}, breed_id={:?}, gender={:?}",
            dto.name, dto.species_id, dto.breed_id, dto.gender);

        let now = Utc::now();

        // Insert the patient using SeaORM
        let new_patient = patient::ActiveModel {
            name: Set(dto.name),
            species_id: Set(dto.species_id),
            breed_id: Set(dto.breed_id),
            gender: Set(dto.gender),
            date_of_birth: Set(dto.date_of_birth),
            color: Set(None),
            weight: Set(dto.weight),
            microchip_id: Set(None),
            medical_notes: Set(dto.medical_notes),
            is_active: Set(true),
            household_id: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };

        let result = PatientEntity::insert(new_patient)
            .exec(db)
            .await
            .map_err(|e| {
                log::error!("❌ Failed to insert patient: {}", e);
                format!("Failed to create patient: {}", e)
            })?;

        let patient_id = result.last_insert_id;

        // If household_id is provided, create the relationship
        if let Some(household_id) = dto.household_id {
            db.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary) VALUES (?, ?, 'Pet', 1)",
                [patient_id.into(), household_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to create household relationship: {}", e))?;
        }

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

        match dto.species_id {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                return Err("species_id cannot be null".to_string());
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
        let search_pattern = format!("%{}%", query);

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
                 WHERE p.name LIKE ? OR p.microchip_id LIKE ?
                 ORDER BY p.name
                 LIMIT 50"#,
                [search_pattern.clone().into(), search_pattern.into()],
            ))
            .await
            .map_err(|e| format!("Failed to search patients: {}", e))?;

        rows.iter()
            .map(Self::row_to_patient)
            .collect()
    }

    pub async fn advanced_search(
        db: &DatabaseConnection,
        patient_name: Option<&str>,
        species: Option<&str>,
    ) -> Result<Vec<Patient>, String> {
        let mut sql = String::from(
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
             WHERE 1=1"#
        );

        let mut params: Vec<Value> = Vec::new();

        if let Some(name) = patient_name {
            sql.push_str(" AND p.name LIKE ?");
            params.push(format!("%{}%", name).into());
        }

        if let Some(species_name) = species {
            sql.push_str(" AND s.name LIKE ?");
            params.push(format!("%{}%", species_name).into());
        }

        sql.push_str(" ORDER BY p.name LIMIT 100");

        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &sql,
                params,
            ))
            .await
            .map_err(|e| format!("Failed to search patients: {}", e))?;

        rows.iter()
            .map(Self::row_to_patient)
            .collect()
    }
}
