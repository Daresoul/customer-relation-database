use tauri::State;
use crate::database::connection::DatabasePool;
use crate::database::config::get_database_path;

#[tauri::command]
pub async fn debug_database_info(app: tauri::AppHandle, pool: State<'_, DatabasePool>) -> Result<String, String> {
    let db_path = get_database_path(&app).map_err(|e| e.to_string())?;

    let pool = pool.lock().await;

    // Count records in each table
    let owner_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM owners")
        .fetch_one(&*pool)
        .await
        .unwrap_or(0);

    let patient_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM patients")
        .fetch_one(&*pool)
        .await
        .unwrap_or(0);

    let relationship_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM patient_owners")
        .fetch_one(&*pool)
        .await
        .unwrap_or(0);

    // Look for owners with "abc" in their names
    let abc_owners: Vec<(i32, String, String)> = sqlx::query_as(
        "SELECT id, first_name, last_name FROM owners
         WHERE first_name LIKE '%abc%' OR last_name LIKE '%abc%'"
    )
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    // Look for patients named "Abi"
    let abi_patients: Vec<(i32, String)> = sqlx::query_as(
        "SELECT id, name FROM patients WHERE name LIKE '%Abi%'"
    )
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    // Get all owners (first 5) to see what's actually in the database
    let sample_owners: Vec<(i32, String, String)> = sqlx::query_as(
        "SELECT id, first_name, last_name FROM owners LIMIT 5"
    )
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

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