use serde::{Deserialize, Serialize, Deserializer};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePatientDto {
    pub name: String,
    pub species_id: i64,
    pub breed_id: Option<i64>,
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
    #[serde(default)]
    pub species_id: MaybeNull<i64>,
    #[serde(default)]
    pub breed_id: MaybeNull<i64>,
    #[serde(default)]
    pub gender: MaybeNull<String>,
    #[serde(default)]
    pub date_of_birth: MaybeNull<NaiveDate>,
    #[serde(default)]
    pub color: MaybeNull<String>,
    #[serde(default)]
    pub weight: MaybeNull<f64>,
    #[serde(default)]
    pub microchip_id: MaybeNull<String>,
    #[serde(default)]
    pub medical_notes: MaybeNull<String>,
    pub is_active: Option<bool>,
}