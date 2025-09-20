use sqlx::SqlitePool;
use crate::models::{Patient, Owner};

pub async fn search_patients(pool: &SqlitePool, query: &str) -> Result<Vec<Patient>, sqlx::Error> {
    let search_pattern = format!("%{}%", query);

    sqlx::query_as::<_, Patient>(
        "SELECT
            p.id,
            p.name,
            p.species,
            p.breed,
            p.date_of_birth,
            CAST(p.weight AS REAL) as weight,
            p.medical_notes,
            ph.household_id,
            p.created_at,
            p.updated_at
         FROM patients p
         LEFT JOIN patient_households ph ON p.id = ph.patient_id AND ph.is_primary = 1
         WHERE p.name LIKE ? OR p.species LIKE ? OR p.breed LIKE ? OR p.medical_notes LIKE ?
         ORDER BY
           CASE
             WHEN p.name LIKE ? THEN 1
             WHEN p.species LIKE ? THEN 2
             WHEN p.breed LIKE ? THEN 3
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

pub async fn search_owners(pool: &SqlitePool, query: &str) -> Result<Vec<Owner>, sqlx::Error> {
    let search_pattern = format!("%{}%", query);

    sqlx::query_as::<_, Owner>(
        "SELECT id, first_name, last_name, email, phone, address, created_at, updated_at
         FROM owners
         WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?
         ORDER BY
           CASE
             WHEN first_name LIKE ? THEN 1
             WHEN last_name LIKE ? THEN 2
             WHEN email LIKE ? THEN 3
             ELSE 4
           END,
           last_name, first_name"
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

pub async fn search_patients_by_owner(pool: &SqlitePool, owner_query: &str) -> Result<Vec<Patient>, sqlx::Error> {
    let search_pattern = format!("%{}%", owner_query);

    sqlx::query_as::<_, Patient>(
        "SELECT DISTINCT p.id, p.name, p.species, p.breed, p.date_of_birth, p.weight, p.medical_notes, p.created_at, p.updated_at
         FROM patients p
         INNER JOIN patient_owners po ON p.id = po.patient_id
         INNER JOIN owners o ON po.owner_id = o.id
         WHERE o.first_name LIKE ? OR o.last_name LIKE ? OR o.email LIKE ?
         ORDER BY p.name"
    )
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .fetch_all(pool)
    .await
}

pub async fn search_owners_by_patient(pool: &SqlitePool, patient_query: &str) -> Result<Vec<Owner>, sqlx::Error> {
    let search_pattern = format!("%{}%", patient_query);

    sqlx::query_as::<_, Owner>(
        "SELECT DISTINCT o.id, o.first_name, o.last_name, o.email, o.phone, o.address, o.created_at, o.updated_at
         FROM owners o
         INNER JOIN patient_owners po ON o.id = po.owner_id
         INNER JOIN patients p ON po.patient_id = p.id
         WHERE p.name LIKE ? OR p.species LIKE ? OR p.breed LIKE ?
         ORDER BY o.last_name, o.first_name"
    )
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .fetch_all(pool)
    .await
}

// Advanced search that looks for patients and owners based on combined criteria
pub async fn advanced_search(
    pool: &SqlitePool,
    patient_name: Option<&str>,
    species: Option<&str>,
    owner_name: Option<&str>,
) -> Result<Vec<Patient>, sqlx::Error> {
    // If no search criteria, return empty result
    if patient_name.is_none() && species.is_none() && owner_name.is_none() {
        return Ok(Vec::new());
    }

    let has_owner_criteria = owner_name.is_some();

    let base_query = if has_owner_criteria {
        "SELECT DISTINCT p.id, p.name, p.species, p.breed, p.date_of_birth, p.weight, p.medical_notes, p.created_at, p.updated_at
         FROM patients p
         INNER JOIN patient_owners po ON p.id = po.patient_id
         INNER JOIN owners o ON po.owner_id = o.id"
    } else {
        "SELECT p.id, p.name, p.species, p.breed, p.date_of_birth, p.weight, p.medical_notes, p.created_at, p.updated_at
         FROM patients p"
    };

    // Note: where_parts was planned for dynamic query building but using match approach instead

    // Simple approach: build separate queries for different combinations
    match (patient_name, species, owner_name) {
        (Some(name), Some(spec), Some(owner)) => {
            let search_pattern = format!("%{}%", name);
            let species_pattern = format!("%{}%", spec);
            let owner_pattern = format!("%{}%", owner);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.name LIKE ? AND p.species LIKE ? AND (o.first_name LIKE ? OR o.last_name LIKE ?) ORDER BY p.name", base_query))
                .bind(search_pattern)
                .bind(species_pattern)
                .bind(&owner_pattern)
                .bind(&owner_pattern)
                .fetch_all(pool)
                .await
        },
        (Some(name), Some(spec), None) => {
            let search_pattern = format!("%{}%", name);
            let species_pattern = format!("%{}%", spec);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.name LIKE ? AND p.species LIKE ? ORDER BY p.name", base_query))
                .bind(search_pattern)
                .bind(species_pattern)
                .fetch_all(pool)
                .await
        },
        (Some(name), None, Some(owner)) => {
            let search_pattern = format!("%{}%", name);
            let owner_pattern = format!("%{}%", owner);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.name LIKE ? AND (o.first_name LIKE ? OR o.last_name LIKE ?) ORDER BY p.name", base_query))
                .bind(search_pattern)
                .bind(&owner_pattern)
                .bind(&owner_pattern)
                .fetch_all(pool)
                .await
        },
        (None, Some(spec), Some(owner)) => {
            let species_pattern = format!("%{}%", spec);
            let owner_pattern = format!("%{}%", owner);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.species LIKE ? AND (o.first_name LIKE ? OR o.last_name LIKE ?) ORDER BY p.name", base_query))
                .bind(species_pattern)
                .bind(&owner_pattern)
                .bind(&owner_pattern)
                .fetch_all(pool)
                .await
        },
        (Some(name), None, None) => {
            let search_pattern = format!("%{}%", name);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.name LIKE ? ORDER BY p.name", base_query))
                .bind(search_pattern)
                .fetch_all(pool)
                .await
        },
        (None, Some(spec), None) => {
            let species_pattern = format!("%{}%", spec);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE p.species LIKE ? ORDER BY p.name", base_query))
                .bind(species_pattern)
                .fetch_all(pool)
                .await
        },
        (None, None, Some(owner)) => {
            let owner_pattern = format!("%{}%", owner);

            sqlx::query_as::<_, Patient>(&format!("{} WHERE (o.first_name LIKE ? OR o.last_name LIKE ?) ORDER BY p.name", base_query))
                .bind(&owner_pattern)
                .bind(&owner_pattern)
                .fetch_all(pool)
                .await
        },
        (None, None, None) => Ok(Vec::new())
    }
}