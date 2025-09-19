use sqlx::{SqlitePool, Row};
use crate::models::PatientOwner;

pub async fn add_patient_owner(
    pool: &SqlitePool,
    patient_id: i64,
    owner_id: i64,  // This is actually a household_id
    relationship_type: Option<String>,
    is_primary: bool,
) -> Result<PatientOwner, sqlx::Error> {
    let relationship_type = relationship_type.unwrap_or_else(|| "primary_household".to_string());

    // If setting as primary, remove primary status from other relationships for this patient
    // Note: The trigger ensure_one_primary_household handles this automatically

    sqlx::query(
        "INSERT OR REPLACE INTO patient_households (patient_id, household_id, relationship_type, is_primary)
         VALUES (?, ?, ?, ?)"
    )
    .bind(patient_id)
    .bind(owner_id)  // owner_id is actually household_id
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
    owner_id: i64,  // This is actually household_id
) -> Result<Option<PatientOwner>, sqlx::Error> {
    // Query from patient_households and map household_id to owner_id for compatibility
    let row = sqlx::query(
        "SELECT patient_id, household_id as owner_id, relationship_type, is_primary, created_at
         FROM patient_households
         WHERE patient_id = ? AND household_id = ?"
    )
    .bind(patient_id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = row {
        Ok(Some(PatientOwner {
            patient_id: row.get("patient_id"),
            owner_id: row.get("owner_id"),
            relationship_type: row.get("relationship_type"),
            is_primary: row.get("is_primary"),
            created_at: row.get("created_at"),
        }))
    } else {
        Ok(None)
    }
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