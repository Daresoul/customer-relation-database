use serde::{Deserialize, Serialize};
use chrono::NaiveDate;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePatientDto {
    pub name: String,
    pub species: String,
    pub breed: Option<String>,
    pub gender: Option<String>,
    pub date_of_birth: Option<NaiveDate>,
    pub weight: Option<f64>,
    pub medical_notes: Option<String>,
    pub household_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePatientDto {
    pub name: Option<String>,
    pub species: Option<String>,
    pub breed: Option<String>,
    pub gender: Option<String>,
    pub date_of_birth: Option<NaiveDate>,
    pub color: Option<String>,
    pub weight: Option<f64>,
    pub microchip_id: Option<String>,
    pub medical_notes: Option<String>,
    pub is_active: Option<bool>,
}