use tauri::State;
use crate::database::DatabasePool;
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
    pool: State<'_, DatabasePool>
) -> Result<DashboardStats, String> {
    let pool = pool.lock().await;

    // Get all counts in a single query for efficiency
    let stats = sqlx::query_as::<_, (i64, i64, i64, i64)>(
        r#"
        SELECT
            (SELECT COUNT(*) FROM patients) as total_patients,
            (SELECT COUNT(*) FROM patients WHERE is_active = 1 OR is_active IS NULL) as active_patients,
            (SELECT COUNT(*) FROM households) as total_households,
            (SELECT COUNT(*) FROM medical_records WHERE is_archived = 0) as total_medical_records
        "#
    )
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to get stats: {}", e))?;

    Ok(DashboardStats {
        total_patients: stats.0,
        active_patients: stats.1,
        total_households: stats.2,
        total_medical_records: stats.3,
    })
}