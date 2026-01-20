use tauri::State;
use crate::database::SeaOrmPool;
use sea_orm::*;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_patients: i64,
    pub active_patients: i64,
    pub total_households: i64,
    pub total_medical_records: i64,
}

#[tauri::command]
pub async fn get_dashboard_stats(
    pool: State<'_, SeaOrmPool>
) -> Result<DashboardStats, String> {
    // Get all counts in a single query for efficiency
    let row = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            r#"
            SELECT
                (SELECT COUNT(*) FROM patients) as total_patients,
                (SELECT COUNT(*) FROM patients WHERE is_active = 1 OR is_active IS NULL) as active_patients,
                (SELECT COUNT(*) FROM households) as total_households,
                (SELECT COUNT(*) FROM medical_records WHERE is_archived = 0) as total_medical_records
            "#.to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to get stats: {}", e))?
        .ok_or_else(|| "No stats returned".to_string())?;

    Ok(DashboardStats {
        total_patients: row.try_get("", "total_patients").unwrap_or(0),
        active_patients: row.try_get("", "active_patients").unwrap_or(0),
        total_households: row.try_get("", "total_households").unwrap_or(0),
        total_medical_records: row.try_get("", "total_medical_records").unwrap_or(0),
    })
}
