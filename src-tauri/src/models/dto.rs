use serde::{Deserialize, Serialize};
use chrono::NaiveDate;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePatientDto {
    pub name: String,
    pub species: String,
    pub breed: Option<String>,
    pub date_of_birth: Option<NaiveDate>,
    pub weight: Option<f64>,
    pub medical_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOwnerDto {
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePatientDto {
    pub name: Option<String>,
    pub species: Option<String>,
    pub breed: Option<String>,
    pub date_of_birth: Option<NaiveDate>,
    pub weight: Option<f64>,
    pub medical_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateOwnerDto {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
}