use sqlx::SqlitePool;
use crate::models::PatientOwner;

pub async fn add_patient_owner(
    pool: &SqlitePool,
    patient_id: i64,
    owner_id: i64,
    relationship_type: Option<String>,
    is_primary: bool,
) -> Result<PatientOwner, sqlx::Error> {
    let relationship_type = relationship_type.unwrap_or_else(|| "Owner".to_string());

    // If setting as primary, remove primary status from other relationships for this patient
    if is_primary {
        sqlx::query(
            "UPDATE patient_owners SET is_primary = 0 WHERE patient_id = ?"
        )
        .bind(patient_id)
        .execute(pool)
        .await?;
    }

    sqlx::query(
        "INSERT OR REPLACE INTO patient_owners (patient_id, owner_id, relationship_type, is_primary)
         VALUES (?, ?, ?, ?)"
    )
    .bind(patient_id)
    .bind(owner_id)
    .bind(&relationship_type)
    .bind(is_primary)
    .execute(pool)
    .await?;

    get_patient_owner(pool, patient_id, owner_id).await.map(|po| po.unwrap())
}

pub async fn remove_patient_owner(
    pool: &SqlitePool,
    patient_id: i64,
    owner_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "DELETE FROM patient_owners WHERE patient_id = ? AND owner_id = ?"
    )
    .bind(patient_id)
    .bind(owner_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn set_primary_owner(
    pool: &SqlitePool,
    patient_id: i64,
    owner_id: i64,
) -> Result<bool, sqlx::Error> {
    // First, verify that the relationship exists
    let relationship = get_patient_owner(pool, patient_id, owner_id).await?;
    if relationship.is_none() {
        return Ok(false);
    }

    // Remove primary status from all other relationships for this patient
    sqlx::query(
        "UPDATE patient_owners SET is_primary = 0 WHERE patient_id = ?"
    )
    .bind(patient_id)
    .execute(pool)
    .await?;

    // Set this relationship as primary
    let result = sqlx::query(
        "UPDATE patient_owners SET is_primary = 1 WHERE patient_id = ? AND owner_id = ?"
    )
    .bind(patient_id)
    .bind(owner_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn get_patient_owner(
    pool: &SqlitePool,
    patient_id: i64,
    owner_id: i64,
) -> Result<Option<PatientOwner>, sqlx::Error> {
    sqlx::query_as::<_, PatientOwner>(
        "SELECT patient_id, owner_id, relationship_type, is_primary, created_at
         FROM patient_owners
         WHERE patient_id = ? AND owner_id = ?"
    )
    .bind(patient_id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
}

pub async fn get_patient_owners(pool: &SqlitePool, patient_id: i64) -> Result<Vec<PatientOwner>, sqlx::Error> {
    sqlx::query_as::<_, PatientOwner>(
        "SELECT patient_id, owner_id, relationship_type, is_primary, created_at
         FROM patient_owners
         WHERE patient_id = ?
         ORDER BY is_primary DESC, created_at"
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn get_owner_patients(pool: &SqlitePool, owner_id: i64) -> Result<Vec<PatientOwner>, sqlx::Error> {
    sqlx::query_as::<_, PatientOwner>(
        "SELECT patient_id, owner_id, relationship_type, is_primary, created_at
         FROM patient_owners
         WHERE owner_id = ?
         ORDER BY created_at"
    )
    .bind(owner_id)
    .fetch_all(pool)
    .await
}

pub async fn update_relationship_type(
    pool: &SqlitePool,
    patient_id: i64,
    owner_id: i64,
    relationship_type: String,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE patient_owners SET relationship_type = ? WHERE patient_id = ? AND owner_id = ?"
    )
    .bind(relationship_type)
    .bind(patient_id)
    .bind(owner_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}