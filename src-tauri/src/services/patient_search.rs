use sea_orm::DatabaseConnection;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientSearchHit {
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub species: Option<String>,
    pub microchip_id: Option<String>,
    pub is_active: bool,
    pub household_id: Option<i64>,
    pub owner_name: Option<String>,
    pub owner_phone: Option<String>,
}

pub async fn search_patients_everywhere(
    _db: &DatabaseConnection,
    _query: &str,
    _limit: usize,
) -> Result<Vec<PatientSearchHit>, String> {
    Ok(Vec::new())
}
