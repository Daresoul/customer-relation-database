use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

/// Patients with at least one (non-archived) record created in `[start, end)`.
/// Bounds are ISO timestamps; the frontend sends its local day in UTC.
/// `julianday` compares stored RFC 3339 stamps across time zones.
pub async fn count_patients_seen_between(
    db: &DatabaseConnection,
    start: &str,
    end: &str,
) -> Result<i64, String> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(DISTINCT patient_id) AS seen FROM medical_records
             WHERE COALESCE(is_archived, 0) = 0
               AND julianday(created_at) >= julianday(?)
               AND julianday(created_at) < julianday(?)",
            [start.into(), end.into()],
        ))
        .await
        .map_err(|e| format!("Failed to count today's patients: {}", e))?;
    Ok(row.and_then(|r| r.try_get("", "seen").ok()).unwrap_or(0))
}
