//! Household lifecycle: merge two households, move a pet, the single primary
//! person, and the guarded delete.

use crate::models::household::*;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergePet {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeSide {
    pub household: Household,
    pub people: Vec<PersonWithContacts>,
    pub pets: Vec<MergePet>,
    pub record_count: i64,
    pub appointment_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseholdMergePreview {
    pub keep: MergeSide,
    pub merge: MergeSide,
}

pub async fn resolve_household_id(_db: &DatabaseConnection, _household_id: i32) -> Result<Option<i32>, String> {
    Err("not implemented".into())
}

pub async fn merge_preview(
    _db: &DatabaseConnection,
    _keep_id: i32,
    _merge_id: i32,
) -> Result<HouseholdMergePreview, String> {
    Err("not implemented".into())
}

pub async fn merge_households(
    _db: &DatabaseConnection,
    _keep_id: i32,
    _merge_id: i32,
    _details_from: i32,
) -> Result<(), String> {
    Err("not implemented".into())
}

pub async fn set_primary_person(_db: &DatabaseConnection, _person_id: i32) -> Result<(), String> {
    Err("not implemented".into())
}

pub async fn delete_person(_db: &DatabaseConnection, _person_id: i32) -> Result<(), String> {
    Err("not implemented".into())
}

pub async fn set_patient_household(
    _db: &DatabaseConnection,
    _patient_id: i64,
    _household_id: Option<i32>,
) -> Result<(), String> {
    Err("not implemented".into())
}
