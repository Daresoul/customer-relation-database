use sea_orm::DatabaseConnection;

pub async fn count_patients_seen_between(
    _db: &DatabaseConnection,
    _start: &str,
    _end: &str,
) -> Result<i64, String> {
    Ok(0)
}
