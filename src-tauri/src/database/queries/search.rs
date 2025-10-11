use sqlx::SqlitePool;
use crate::models::Patient;

pub async fn search_patients(pool: &SqlitePool, query: &str) -> Result<Vec<Patient>, sqlx::Error> {
    let search_pattern = format!("%{}%", query);

    sqlx::query_as::<_, Patient>(
        "SELECT
            p.id,
            p.name,
            p.species_id,
            p.breed_id,
            s.name as species,
            b.name as breed,
            p.gender,
            p.date_of_birth,
            p.color,
            CAST(p.weight AS REAL) as weight,
            p.microchip_id,
            p.medical_notes,
            p.is_active,
            ph.household_id,
            p.created_at,
            p.updated_at
         FROM patients p
         LEFT JOIN species s ON p.species_id = s.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
         WHERE p.name LIKE ? OR s.name LIKE ? OR b.name LIKE ? OR p.medical_notes LIKE ?
         ORDER BY
           CASE
             WHEN p.name LIKE ? THEN 1
             WHEN s.name LIKE ? THEN 2
             WHEN b.name LIKE ? THEN 3
             ELSE 4
           END,
           p.name"
    )
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .fetch_all(pool)
    .await
}

// Advanced search that looks for patients based on combined criteria
pub async fn advanced_search(
    pool: &SqlitePool,
    patient_name: Option<&str>,
    species: Option<&str>,
) -> Result<Vec<Patient>, sqlx::Error> {
    // If no search criteria, return empty result
    if patient_name.is_none() && species.is_none() {
        return Ok(Vec::new());
    }

    let base_query = "SELECT p.id, p.name, p.species_id, p.breed_id, s.name as species, b.name as breed,
                      p.gender, p.date_of_birth, p.color, CAST(p.weight AS REAL) as weight,
                      p.microchip_id, p.medical_notes, p.is_active, ph.household_id,
                      p.created_at, p.updated_at
                      FROM patients p
                      LEFT JOIN species s ON p.species_id = s.id
                      LEFT JOIN breeds b ON p.breed_id = b.id
                      LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1";

    // Simple approach: build separate queries for different combinations
    match (patient_name, species) {
        (Some(name), Some(spec)) => {
            let search_pattern = format!("%{}%", name);
            let species_pattern = format!("%{}%", spec);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.name LIKE ? AND s.name LIKE ? ORDER BY p.name", base_query))
                .bind(search_pattern)
                .bind(species_pattern)
                .fetch_all(pool)
                .await
        },
        (Some(name), None) => {
            let search_pattern = format!("%{}%", name);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.name LIKE ? ORDER BY p.name", base_query))
                .bind(search_pattern)
                .fetch_all(pool)
                .await
        },
        (None, Some(spec)) => {
            let species_pattern = format!("%{}%", spec);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE s.name LIKE ? ORDER BY p.name", base_query))
                .bind(species_pattern)
                .fetch_all(pool)
                .await
        },
        (None, None) => Ok(Vec::new())
    }
}