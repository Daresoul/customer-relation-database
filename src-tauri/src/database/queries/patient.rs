use sqlx::SqlitePool;
use crate::models::{Patient, CreatePatientDto, UpdatePatientDto};
use crate::models::dto::MaybeNull;

pub async fn get_all_patients(pool: &SqlitePool) -> Result<Vec<Patient>, sqlx::Error> {
    sqlx::query_as::<_, Patient>(
        "SELECT
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
         ORDER BY p.created_at DESC"
    )
    .fetch_all(pool)
    .await
}

pub async fn get_patient_by_id(pool: &SqlitePool, id: i64) -> Result<Option<Patient>, sqlx::Error> {
    sqlx::query_as::<_, Patient>(
        "SELECT
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
         WHERE p.id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn create_patient(pool: &SqlitePool, dto: CreatePatientDto) -> Result<Patient, sqlx::Error> {
    // Start a transaction
    let mut tx = pool.begin().await?;

    // Insert the patient
    let result = sqlx::query(
        "INSERT INTO patients (name, species_id, breed_id, gender, date_of_birth, weight, medical_notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&dto.name)
    .bind(dto.species_id)
    .bind(dto.breed_id)
    .bind(&dto.gender)
    .bind(&dto.date_of_birth)
    .bind(&dto.weight)
    .bind(&dto.medical_notes)
    .bind(true)
    .execute(&mut *tx)
    .await?;

    let patient_id = result.last_insert_rowid();

    // If household_id is provided, create the relationship
    if let Some(household_id) = dto.household_id {
        sqlx::query(
            "INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary)
             VALUES (?, ?, 'Pet', 1)"
        )
        .bind(patient_id)
        .bind(household_id)
        .execute(&mut *tx)
        .await?;
    }

    // Commit the transaction
    tx.commit().await?;

    get_patient_by_id(pool, patient_id).await.map(|p| p.unwrap())
}

pub async fn update_patient(pool: &SqlitePool, id: i64, dto: UpdatePatientDto) -> Result<Option<Patient>, sqlx::Error> {
    // Build dynamic query based on which fields are being updated
    let mut updates = Vec::new();
    let mut has_updates = false;

    if dto.name.is_some() {
        updates.push("name = ?");
        has_updates = true;
    }
    // For species_id and breed_id, we use MaybeNull to distinguish:
    // Undefined = not provided, Null = set to null, Value(id) = set to id
    if !matches!(dto.species_id, MaybeNull::Undefined) {
        updates.push("species_id = ?");
        has_updates = true;
    }
    if !matches!(dto.breed_id, MaybeNull::Undefined) {
        updates.push("breed_id = ?");
        has_updates = true;
    }
    if !matches!(dto.gender, MaybeNull::Undefined) {
        updates.push("gender = ?");
        has_updates = true;
    }
    if !matches!(dto.date_of_birth, MaybeNull::Undefined) {
        updates.push("date_of_birth = ?");
        has_updates = true;
    }
    if !matches!(dto.weight, MaybeNull::Undefined) {
        updates.push("weight = ?");
        has_updates = true;
    }
    if !matches!(dto.medical_notes, MaybeNull::Undefined) {
        updates.push("medical_notes = ?");
        has_updates = true;
    }
    if !matches!(dto.color, MaybeNull::Undefined) {
        updates.push("color = ?");
        has_updates = true;
    }
    if !matches!(dto.microchip_id, MaybeNull::Undefined) {
        updates.push("microchip_id = ?");
        has_updates = true;
    }
    if dto.is_active.is_some() {
        updates.push("is_active = ?");
        has_updates = true;
    }

    if !has_updates {
        return get_patient_by_id(pool, id).await;
    }

    let query_str = format!(
        "UPDATE patients SET {} WHERE id = ?",
        updates.join(", ")
    );

    println!("Executing UPDATE query: {}", query_str);
    println!("With dto: {:?}", dto);

    let mut query = sqlx::query(&query_str);

    if let Some(name) = dto.name {
        query = query.bind(name);
    }
    // Convert MaybeNull to Option<i64> for binding
    match dto.species_id {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<i64>::None); },
        MaybeNull::Value(id) => { query = query.bind(Some(id)); },
    }
    match dto.breed_id {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<i64>::None); },
        MaybeNull::Value(id) => { query = query.bind(Some(id)); },
    }
    match dto.gender {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<String>::None); },
        MaybeNull::Value(v) => { query = query.bind(Some(v)); },
    }
    match dto.date_of_birth {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<chrono::NaiveDate>::None); },
        MaybeNull::Value(v) => { query = query.bind(Some(v)); },
    }
    match dto.weight {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<f64>::None); },
        MaybeNull::Value(v) => { query = query.bind(Some(v)); },
    }
    match dto.medical_notes {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<String>::None); },
        MaybeNull::Value(v) => { query = query.bind(Some(v)); },
    }
    match dto.color {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<String>::None); },
        MaybeNull::Value(v) => { query = query.bind(Some(v)); },
    }
    match dto.microchip_id {
        MaybeNull::Undefined => {},
        MaybeNull::Null => { query = query.bind(Option::<String>::None); },
        MaybeNull::Value(v) => { query = query.bind(Some(v)); },
    }
    if let Some(is_active) = dto.is_active {
        query = query.bind(is_active);
    }

    query = query.bind(id);

    let result = query.execute(pool).await?;

    println!("UPDATE affected {} rows", result.rows_affected());

    if result.rows_affected() > 0 {
        let updated_patient = get_patient_by_id(pool, id).await?;
        println!("get_patient_by_id returned: {:?}", updated_patient);
        Ok(updated_patient)
    } else {
        Ok(None)
    }
}

pub async fn delete_patient(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM patients WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn get_patients_by_species(pool: &SqlitePool, species: &str) -> Result<Vec<Patient>, sqlx::Error> {
    sqlx::query_as::<_, Patient>(
        "SELECT
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
         ORDER BY p.name"
    )
    .bind(species)
    .fetch_all(pool)
    .await
}