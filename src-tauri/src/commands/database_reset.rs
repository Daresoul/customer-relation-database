use tauri::{AppHandle, State};
use crate::database::{DatabasePool, get_database_path, run_migrations};
use rand::{Rng, seq::SliceRandom, SeedableRng};
use crate::models::dto::CreatePatientDto;
use crate::services::medical_record::MedicalRecordService;
use crate::models::medical::CreateMedicalRecordInput;
use chrono::Utc;

#[tauri::command]
pub async fn reset_database(
    app: AppHandle,
    pool: State<'_, DatabasePool>
) -> Result<String, String> {
    println!("Resetting database...");

    // Get the database path
    let db_path = get_database_path(&app).map_err(|e| e.to_string())?;

    // Lock the pool
    let pool_guard = pool.lock().await;

    // Drop all tables
    let drop_queries = vec![
        "DROP TABLE IF EXISTS patient_owners",
        "DROP TABLE IF EXISTS patient_households",
        "DROP TABLE IF EXISTS person_contacts",
        "DROP TABLE IF EXISTS people",
        "DROP TABLE IF EXISTS households",
        "DROP TABLE IF EXISTS patients",
        "DROP TABLE IF EXISTS owners",
        "DROP TABLE IF EXISTS migrations",
        // Drop FTS tables
        "DROP TABLE IF EXISTS patient_search",
        "DROP TABLE IF EXISTS patient_search_data",
        "DROP TABLE IF EXISTS patient_search_idx",
        "DROP TABLE IF EXISTS patient_search_docsize",
        "DROP TABLE IF EXISTS patient_search_config",
        "DROP TABLE IF EXISTS household_search",
        "DROP TABLE IF EXISTS household_search_data",
        "DROP TABLE IF EXISTS household_search_idx",
        "DROP TABLE IF EXISTS household_search_content",
        "DROP TABLE IF EXISTS household_search_docsize",
        "DROP TABLE IF EXISTS household_search_config",
        // Drop views
        "DROP VIEW IF EXISTS patients_owners_view",
    ];

    for query in drop_queries {
        sqlx::query(query)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to drop table: {}", e))?;
    }

    println!("All tables dropped");

    // Run migrations to recreate tables
    run_migrations(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to run migrations: {}", e))?;

    println!("Database reset complete");

    Ok(format!(
        "Database reset successfully at: {}",
        db_path.display()
    ))
}

#[tauri::command]
pub async fn wipe_database_data(
    pool: State<'_, DatabasePool>
) -> Result<String, String> {
    println!("Wiping database data (keeping schema)...");

    let pool_guard = pool.lock().await;

    // Delete data in correct order to respect foreign keys
    let delete_queries = vec![
        "DELETE FROM patient_owners",
        "DELETE FROM patient_households",
        "DELETE FROM person_contacts",
        "DELETE FROM people",
        "DELETE FROM households",
        "DELETE FROM patients",
        "DELETE FROM owners",
    ];

    let mut deleted_count = 0;
    for query in delete_queries {
        let result = sqlx::query(query)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to delete data: {}", e))?;
        deleted_count += result.rows_affected();
    }

    // Reset auto-increment counters
    sqlx::query("DELETE FROM sqlite_sequence")
        .execute(&*pool_guard)
        .await
        .ok(); // Ignore errors as table might not exist

    Ok(format!(
        "Database data wiped successfully. {} records deleted.",
        deleted_count
    ))
}

#[tauri::command]
pub async fn populate_database(
    pool: State<'_, DatabasePool>,
    households: Option<i32>,
    seed: Option<u64>,
) -> Result<String, String> {
    let households = households.unwrap_or(1000);
    let mut rng = if let Some(s) = seed { rand::rngs::StdRng::seed_from_u64(s) } else { rand::rngs::StdRng::from_entropy() };

    // Data sources
    let last_names = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin"]; 
    let species_list = ["dog","cat","bird","rabbit","hamster","guinea_pig","reptile"];
    let dog_breeds = ["Labrador","German Shepherd","Poodle","Bulldog","Beagle","Boxer","Dachshund"]; 
    let cat_breeds = ["Siamese","Persian","Maine Coon","Ragdoll","Sphynx","Bengal"]; 
    let genders = ["Male","Female","Unknown"];
    let pet_names = ["Bella","Max","Luna","Charlie","Lucy","Cooper","Milo","Bailey","Daisy","Sadie","Oliver","Buddy","Lola","Rocky","Zoe"]; 
    let procedures = [
        "Vaccination","Dental Cleaning","Spay/Neuter","Blood Test","X-Ray","Ultrasound","Deworming","Microchipping","Ear Cleaning","Nail Trimming"
    ];
    let note_titles = [
        "Annual Checkup","Follow-up Note","Observation","Diet Recommendation","Behavioral Note","Allergy Note","Medication Note"
    ];

    let lorem_sentences = [
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
        "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
        "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
        "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.",
        "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt.",
    ];

    let mut created_households = 0i64;
    let mut created_patients = 0i64;
    let mut created_records = 0i64;

    let pool = pool.lock().await;

    for _ in 0..households {
        let last_name = last_names.choose(&mut rng).unwrap().to_string();
        // Create household
        let res = sqlx::query(
            "INSERT INTO households (household_name, address, city, postal_code, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&last_name)
        .bind(Option::<String>::None)
        .bind(Option::<String>::None)
        .bind(Option::<String>::None)
        .bind(Option::<String>::None)
        .bind(Utc::now())
        .bind(Utc::now())
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to insert household: {}", e))?;
        let household_id = res.last_insert_rowid() as i32;
        created_households += 1;

        // Pets 1..=5
        let pet_count = rng.gen_range(1..=5);
        for _ in 0..pet_count {
            let species = species_list.choose(&mut rng).unwrap().to_string();
            let breed = if species == "dog" {
                Some(dog_breeds.choose(&mut rng).unwrap().to_string())
            } else if species == "cat" {
                Some(cat_breeds.choose(&mut rng).unwrap().to_string())
            } else { None };
            let name = pet_names.choose(&mut rng).unwrap().to_string();
            let gender = Some(genders.choose(&mut rng).unwrap().to_string());
            let weight: Option<f64> = Some(rng.gen_range(1.0..=60.0));
            let notes: Option<String> = Some(lorem_sentences.choose(&mut rng).unwrap().to_string());

            let dto = CreatePatientDto {
                name: name.clone(),
                species: species.clone(),
                breed,
                gender,
                date_of_birth: None,
                weight,
                medical_notes: notes,
                household_id: Some(household_id),
            };
            let patient = crate::database::queries::patient::create_patient(&*pool, dto)
                .await
                .map_err(|e| format!("Failed to create patient: {}", e))?;
            created_patients += 1;

            // Medical records: procedures 1..5
            let proc_count = rng.gen_range(1..=5);
            for _ in 0..proc_count {
                let proc_name = procedures.choose(&mut rng).unwrap().to_string();
                let desc = lorem_sentences.choose(&mut rng).unwrap().to_string();
                let p: f64 = rng.gen_range(20.0_f64..=300.0_f64);
                let price = Some((p * 100.0_f64).round() / 100.0_f64);
                let currency_id = Some([1i64,2,3].choose(&mut rng).copied().unwrap());
                let input = CreateMedicalRecordInput {
                    patient_id: patient.id,
                    record_type: "procedure".to_string(),
                    name: proc_name,
                    procedure_name: None,
                    description: desc,
                    price,
                    currency_id,
                };
                let _ = MedicalRecordService::create_medical_record(&*pool, input).await
                    .map_err(|e| format!("Failed to create procedure: {}", e))?;
                created_records += 1;
            }

            // Medical records: notes 1..5
            let note_count = rng.gen_range(1..=5);
            for _ in 0..note_count {
                let title = note_titles.choose(&mut rng).unwrap().to_string();
                let desc = format!("{} {}",
                    lorem_sentences.choose(&mut rng).unwrap(),
                    lorem_sentences.choose(&mut rng).unwrap()
                );
                let input = CreateMedicalRecordInput {
                    patient_id: patient.id,
                    record_type: "note".to_string(),
                    name: title,
                    procedure_name: None,
                    description: desc,
                    price: None,
                    currency_id: None,
                };
                let _ = MedicalRecordService::create_medical_record(&*pool, input).await
                    .map_err(|e| format!("Failed to create note: {}", e))?;
                created_records += 1;
            }
        }
    }

    Ok(format!(
        "Seed complete: households={}, patients={}, records={}",
        created_households, created_patients, created_records
    ))
}
