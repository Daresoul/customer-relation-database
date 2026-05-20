use serde::{Deserialize, Serialize, Deserializer};
use ts_rs::TS;

/// Helper to distinguish between:
/// - Field not provided (None)
/// - Field set to null (Some(None))
/// - Field set to value (Some(Some(value)))
#[derive(Debug, Clone, Serialize)]
pub enum MaybeNull<T> {
    Undefined,
    Null,
    Value(T),
}

impl<'de, T> Deserialize<'de> for MaybeNull<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<T>::deserialize(deserializer).map(|opt| match opt {
            None => MaybeNull::Null,
            Some(v) => MaybeNull::Value(v),
        })
    }
}

impl<T> Default for MaybeNull<T> {
    fn default() -> Self {
        MaybeNull::Undefined
    }
}

use chrono::NaiveDate;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CreatePatientDto {
    // Both name and species_id become optional so a chip-only patient can be
    // created from a scan. The service supplies fallbacks (microchip_id → name,
    // first species in the table → species_id) since the DB still enforces
    // NOT NULL on both columns.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub species_id: Option<i64>,
    #[ts(type = "number | null")]
    pub breed_id: Option<i64>,
    pub gender: Option<String>,
    #[ts(type = "string | null")]
    pub date_of_birth: Option<NaiveDate>,
    pub color: Option<String>,
    pub weight: Option<f64>,
    pub microchip_id: Option<String>,
    pub medical_notes: Option<String>,
    pub household_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdatePatientDto {
    pub name: Option<String>,
    // MaybeNull doesn't have a TS derive (generic enum), so override per field.
    // Serde behaviour: Undefined → field omitted, Null → null, Value → T.
    #[serde(default)]
    #[ts(type = "number | null")]
    pub species_id: MaybeNull<i64>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub breed_id: MaybeNull<i64>,
    #[serde(default)]
    #[ts(type = "string | null")]
    pub gender: MaybeNull<String>,
    #[serde(default)]
    #[ts(type = "string | null")]
    pub date_of_birth: MaybeNull<NaiveDate>,
    #[serde(default)]
    #[ts(type = "string | null")]
    pub color: MaybeNull<String>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub weight: MaybeNull<f64>,
    #[serde(default)]
    #[ts(type = "string | null")]
    pub microchip_id: MaybeNull<String>,
    #[serde(default)]
    #[ts(type = "string | null")]
    pub medical_notes: MaybeNull<String>,
    pub is_active: Option<bool>,
}
