//! Likely duplicates of a household about to be created, by phone, email
//! and person name.

use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DuplicateCheck {
    pub household_name: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phones: Vec<String>,
    pub emails: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateMatch {
    pub household_id: i32,
    pub household_name: Option<String>,
    pub primary_person: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub pet_count: i64,
    /// "phone", "email" and/or "name"
    pub reasons: Vec<String>,
}

pub async fn find_household_duplicates(
    _db: &DatabaseConnection,
    _check: &DuplicateCheck,
) -> Result<Vec<DuplicateMatch>, String> {
    Err("not implemented".into())
}
