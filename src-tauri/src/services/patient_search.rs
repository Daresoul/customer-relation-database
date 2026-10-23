//! One search box for the app header: a pet by its name or chip, or every
//! pet of an owner found by name or phone. Reuses the patient search
//! (Unicode-aware name and chip match) and the household full-text index
//! (owner names, phones with or without separators).

use crate::database::queries::household_search::quick_search_households;
use crate::services::patient::PatientService;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, Value};
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

const MATCHED_HOUSEHOLDS: i32 = 20;

/// Pets matched directly come first, then pets of matched owners; each pet once.
pub async fn search_patients_everywhere(
    db: &DatabaseConnection,
    query: &str,
    limit: usize,
) -> Result<Vec<PatientSearchHit>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let mut ids: Vec<i64> = PatientService::search(db, query)
        .await?
        .into_iter()
        .map(|p| p.id)
        .collect();

    let households: Vec<i64> = quick_search_households(db, query, MATCHED_HOUSEHOLDS)
        .await?
        .into_iter()
        .map(|(id, _)| id as i64)
        .collect();
    for id in patients_of(db, &households).await? {
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    ids.truncate(limit);

    let mut hits = load_hits(db, &ids).await?;
    hits.sort_by_key(|h| ids.iter().position(|id| *id == h.patient_id));
    Ok(hits)
}

fn placeholders(n: usize) -> String {
    vec!["?"; n].join(", ")
}

/// Pets of these households, in the households' order.
async fn patients_of(db: &DatabaseConnection, households: &[i64]) -> Result<Vec<i64>, String> {
    if households.is_empty() {
        return Ok(Vec::new());
    }
    let rows = db
        .query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT ph.patient_id, ph.household_id, LOWER(COALESCE(p.name, '')) AS sort_name
                 FROM patient_households ph JOIN patients p ON p.id = ph.patient_id
                 WHERE ph.household_id IN ({})",
                placeholders(households.len())
            ),
            households.iter().map(|id| Value::from(*id)).collect::<Vec<_>>(),
        ))
        .await
        .map_err(|e| format!("Failed to load the owners' pets: {}", e))?;

    let mut pets: Vec<(usize, String, i64)> = rows
        .iter()
        .filter_map(|r| {
            let patient: i64 = r.try_get("", "patient_id").ok()?;
            let household: i64 = r.try_get("", "household_id").ok()?;
            let name: String = r.try_get("", "sort_name").unwrap_or_default();
            let rank = households.iter().position(|h| *h == household)?;
            Some((rank, name, patient))
        })
        .collect();
    pets.sort();
    Ok(pets.into_iter().map(|(_, _, id)| id).collect())
}

async fn load_hits(db: &DatabaseConnection, ids: &[i64]) -> Result<Vec<PatientSearchHit>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows = db
        .query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                r#"SELECT
                    p.id,
                    p.name,
                    s.name AS species,
                    p.microchip_id,
                    p.is_active,
                    ph.household_id,
                    (SELECT TRIM(COALESCE(pe.first_name, '') || ' ' || COALESCE(pe.last_name, ''))
                       FROM people pe WHERE pe.household_id = ph.household_id
                       ORDER BY pe.is_primary DESC, pe.id LIMIT 1) AS owner_name,
                    (SELECT pc.contact_value
                       FROM person_contacts pc JOIN people pe ON pc.person_id = pe.id
                       WHERE pe.household_id = ph.household_id
                         AND pc.contact_type IN ('phone', 'mobile', 'work_phone')
                       ORDER BY pe.is_primary DESC, pc.is_primary DESC, pc.id LIMIT 1) AS owner_phone
                 FROM patients p
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
                 WHERE p.id IN ({})"#,
                placeholders(ids.len())
            ),
            ids.iter().map(|id| Value::from(*id)).collect::<Vec<_>>(),
        ))
        .await
        .map_err(|e| format!("Failed to load search results: {}", e))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            let owner_name: Option<String> = r.try_get("", "owner_name").ok().flatten();
            Some(PatientSearchHit {
                patient_id: r.try_get("", "id").ok()?,
                patient_name: r.try_get("", "name").ok().flatten(),
                species: r.try_get("", "species").ok().flatten(),
                microchip_id: r.try_get("", "microchip_id").ok().flatten(),
                is_active: r.try_get::<Option<bool>>("", "is_active").ok().flatten().unwrap_or(true),
                household_id: r.try_get("", "household_id").ok().flatten(),
                owner_name: owner_name.filter(|n| !n.is_empty()),
                owner_phone: r.try_get("", "owner_phone").ok().flatten(),
            })
        })
        .collect())
}
