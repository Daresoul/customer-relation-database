use sqlx::SqlitePool;
use crate::models::{Patient, CreatePatientDto, UpdatePatientDto, PatientWithOwners, Owner};

pub async fn get_all_patients(pool: &SqlitePool) -> Result<Vec<Patient>, sqlx::Error> {
    sqlx::query_as::<_, Patient>(
        "SELECT
            p.id,
            p.name,
            p.species,
            p.breed,
            p.gender,
            p.date_of_birth,
            CAST(p.weight AS REAL) as weight,
            p.medical_notes,
            ph.household_id,
            p.created_at,
            p.updated_at
         FROM patients p
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
            p.species,
            p.breed,
            p.gender,
            p.date_of_birth,
            CAST(p.weight AS REAL) as weight,
            p.medical_notes,
            ph.household_id,
            p.created_at,
            p.updated_at
         FROM patients p
         LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
         WHERE p.id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn get_patient_with_owners(pool: &SqlitePool, id: i64) -> Result<Option<PatientWithOwners>, sqlx::Error> {
    let patient = match get_patient_by_id(pool, id).await? {
        Some(p) => p,
        None => return Ok(None),
    };

    let owners = sqlx::query_as::<_, Owner>(
        "SELECT o.id, o.first_name, o.last_name, o.email, o.phone, o.address, o.created_at, o.updated_at
         FROM owners o
         INNER JOIN patient_owners po ON o.id = po.owner_id
         WHERE po.patient_id = ?
         ORDER BY po.is_primary DESC, o.last_name, o.first_name"
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let primary_owner = sqlx::query_as::<_, Owner>(
        "SELECT o.id, o.first_name, o.last_name, o.email, o.phone, o.address, o.created_at, o.updated_at
         FROM owners o
         INNER JOIN patient_owners po ON o.id = po.owner_id
         WHERE po.patient_id = ? AND po.is_primary = 1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(Some(PatientWithOwners {
        patient,
        owners,
        primary_owner,
    }))
}

pub async fn create_patient(pool: &SqlitePool, dto: CreatePatientDto) -> Result<Patient, sqlx::Error> {
    // Start a transaction
    let mut tx = pool.begin().await?;

    // Insert the patient
    let result = sqlx::query(
        "INSERT INTO patients (name, species, breed, gender, date_of_birth, weight, medical_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&dto.name)
    .bind(&dto.species)
    .bind(&dto.breed)
    .bind(&dto.gender)
    .bind(&dto.date_of_birth)
    .bind(&dto.weight)
    .bind(&dto.medical_notes)
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
    if dto.species.is_some() {
        updates.push("species = ?");
        has_updates = true;
    }
    if dto.breed.is_some() {
        updates.push("breed = ?");
        has_updates = true;
    }
    if dto.gender.is_some() {
        updates.push("gender = ?");
        has_updates = true;
    }
    if dto.date_of_birth.is_some() {
        updates.push("date_of_birth = ?");
        has_updates = true;
    }
    if dto.weight.is_some() {
        updates.push("weight = ?");
        has_updates = true;
    }
    if dto.medical_notes.is_some() {
        updates.push("medical_notes = ?");
        has_updates = true;
    }

    if !has_updates {
        return get_patient_by_id(pool, id).await;
    }

    let query_str = format!(
        "UPDATE patients SET {} WHERE id = ?",
        updates.join(", ")
    );

    let mut query = sqlx::query(&query_str);

    if let Some(name) = dto.name {
        query = query.bind(name);
    }
    if let Some(species) = dto.species {
        query = query.bind(species);
    }
    if let Some(breed) = dto.breed {
        query = query.bind(breed);
    }
    if let Some(gender) = dto.gender {
        query = query.bind(gender);
    }
    if let Some(date_of_birth) = dto.date_of_birth {
        query = query.bind(date_of_birth);
    }
    if let Some(weight) = dto.weight {
        query = query.bind(weight);
    }
    if let Some(medical_notes) = dto.medical_notes {
        query = query.bind(medical_notes);
    }

    query = query.bind(id);

    let result = query.execute(pool).await?;

    if result.rows_affected() > 0 {
        get_patient_by_id(pool, id).await
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
            p.species,
            p.breed,
            p.gender,
            p.date_of_birth,
            CAST(p.weight AS REAL) as weight,
            p.medical_notes,
            ph.household_id,
            p.created_at,
            p.updated_at
         FROM patients p
         LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
         WHERE p.species = ?
         ORDER BY p.name"
    )
    .bind(species)
    .fetch_all(pool)
    .await
}