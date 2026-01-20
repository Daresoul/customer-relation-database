use tauri::State;
use crate::database::SeaOrmPool;
use crate::database::config::get_database_path;
use sea_orm::*;

#[tauri::command]
pub async fn debug_database_info(app: tauri::AppHandle, pool: State<'_, SeaOrmPool>) -> Result<String, String> {
    let db_path = get_database_path(&app).map_err(|e| e.to_string())?;

    // Count records in each table
    let owner_count: i64 = pool
        .query_one(Statement::from_string(DbBackend::Sqlite, "SELECT COUNT(*) as cnt FROM owners".to_string()))
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<i64>("", "cnt").ok())
        .unwrap_or(0);

    let patient_count: i64 = pool
        .query_one(Statement::from_string(DbBackend::Sqlite, "SELECT COUNT(*) as cnt FROM patients".to_string()))
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<i64>("", "cnt").ok())
        .unwrap_or(0);

    let relationship_count: i64 = pool
        .query_one(Statement::from_string(DbBackend::Sqlite, "SELECT COUNT(*) as cnt FROM patient_owners".to_string()))
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<i64>("", "cnt").ok())
        .unwrap_or(0);

    // Look for owners with "abc" in their names
    let abc_owners_rows = pool
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id, first_name, last_name FROM owners WHERE first_name LIKE '%abc%' OR last_name LIKE '%abc%'".to_string()
        ))
        .await
        .unwrap_or_default();

    let abc_owners: Vec<(i32, String, String)> = abc_owners_rows
        .iter()
        .filter_map(|r| {
            Some((
                r.try_get::<i32>("", "id").ok()?,
                r.try_get::<String>("", "first_name").ok()?,
                r.try_get::<String>("", "last_name").ok()?,
            ))
        })
        .collect();

    // Look for patients named "Abi"
    let abi_patients_rows = pool
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id, name FROM patients WHERE name LIKE '%Abi%'".to_string()
        ))
        .await
        .unwrap_or_default();

    let abi_patients: Vec<(i32, String)> = abi_patients_rows
        .iter()
        .filter_map(|r| {
            Some((
                r.try_get::<i32>("", "id").ok()?,
                r.try_get::<String>("", "name").ok()?,
            ))
        })
        .collect();

    // Get all owners (first 5) to see what's actually in the database
    let sample_owners_rows = pool
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id, first_name, last_name FROM owners LIMIT 5".to_string()
        ))
        .await
        .unwrap_or_default();

    let sample_owners: Vec<(i32, String, String)> = sample_owners_rows
        .iter()
        .filter_map(|r| {
            Some((
                r.try_get::<i32>("", "id").ok()?,
                r.try_get::<String>("", "first_name").ok()?,
                r.try_get::<String>("", "last_name").ok()?,
            ))
        })
        .collect();

    let mut result = format!(
        "Database path: {}\nOwners: {}\nPatients: {}\nRelationships: {}\n",
        db_path.display(),
        owner_count,
        patient_count,
        relationship_count
    );

    result.push_str("\n--- Looking for 'abc' owners ---\n");
    if abc_owners.is_empty() {
        result.push_str("No owners found with 'abc' in their names\n");
    } else {
        for (id, first, last) in &abc_owners {
            result.push_str(&format!("Owner {}: {} {}\n", id, first, last));
        }
    }

    result.push_str("\n--- Looking for 'Abi' patients ---\n");
    if abi_patients.is_empty() {
        result.push_str("No patients found named 'Abi'\n");
    } else {
        for (id, name) in &abi_patients {
            result.push_str(&format!("Patient {}: {}\n", id, name));
        }
    }

    if owner_count > 0 {
        result.push_str("\n--- Sample owners in database ---\n");
        for (id, first, last) in &sample_owners {
            result.push_str(&format!("Owner {}: {} {}\n", id, first, last));
        }
    }

    Ok(result)
}