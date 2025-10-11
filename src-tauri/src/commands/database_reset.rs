use tauri::{AppHandle, State};
use crate::database::{DatabasePool, get_database_path, run_migrations};
use rand::{Rng, seq::SliceRandom, SeedableRng};
use crate::models::dto::CreatePatientDto;
use crate::services::medical_record::MedicalRecordService;
use crate::models::medical::CreateMedicalRecordInput;
use chrono::Utc;
use fake::{Fake, faker::{
    name::en::*,
    address::en::*,
    lorem::en::*,
}};

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

    println!("\n[SEED] ========================================");
    println!("[SEED] STARTING DATABASE POPULATION");
    println!("[SEED] Requested households: {}", households);
    println!("[SEED] Timestamp: {}", Utc::now());
    println!("[SEED] ========================================\n");

    // Ensure migrations are run first
    let pool_guard = pool.lock().await;
    println!("[SEED] Running migrations to ensure all tables exist...");
    if let Err(e) = run_migrations(&*pool_guard).await {
        println!("[SEED] ERROR: Failed to run migrations: {}", e);
        return Err(format!("Failed to run migrations: {}", e));
    }
    println!("[SEED] Migrations completed successfully");
    drop(pool_guard);  // Release the lock before re-acquiring

    let mut rng = if let Some(s) = seed {
        rand::rngs::StdRng::seed_from_u64(s)
    } else {
        rand::rngs::StdRng::from_entropy()
    };

    // Use faker for pet names too - gives us thousands of possibilities
    // We can also mix in some pet-specific names occasionally
    let special_pet_names = vec![
        "Shadow", "Smokey", "Oreo", "Tiger", "Mittens", "Whiskers",
        "Patches", "Socks", "Boots", "Midnight", "Snowball", "Gizmo",
        "Pixel", "Widget", "Zigzag", "Cosmo", "Storm", "Blaze",
        "Pepper", "Cookie", "Mochi", "Biscuit", "Peanut", "Waffles", "Nugget", "Pickles"
    ];

    let genders = vec!["Male", "Female", "Unknown"];

    // Query all active species from the database dynamically
    let pool_guard = pool.lock().await;
    let all_species: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, name FROM species WHERE active = 1"
    )
    .fetch_all(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch species: {}", e))?;

    if all_species.is_empty() {
        return Err("No species found in database. Please add species first.".to_string());
    }

    // Query all active breeds from the database
    let all_breeds: Vec<(i64, String, i64)> = sqlx::query_as(
        "SELECT id, name, species_id FROM breeds WHERE active = 1"
    )
    .fetch_all(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch breeds: {}", e))?;
    drop(pool_guard);

    println!("[SEED] Found {} species and {} breeds in database", all_species.len(), all_breeds.len());

    let medical_procedures = vec![
        // Common procedures
        "Annual Wellness Exam", "Vaccination - Rabies", "Vaccination - DHPP",
        "Vaccination - FVRCP", "Dental Cleaning", "Spay Surgery", "Neuter Surgery",
        "Microchip Implantation", "Nail Trimming", "Ear Cleaning",
        // Diagnostic
        "Blood Test - CBC", "Blood Test - Chemistry", "Urinalysis", "Fecal Exam",
        "X-Ray", "Ultrasound", "Skin Scraping", "Heartworm Test",
        // Treatment
        "Wound Treatment", "Antibiotic Treatment", "Flea Treatment", "Deworming",
        "Allergy Treatment", "Pain Management", "IV Fluids", "Bandage Change",
        // Surgery
        "Mass Removal", "Tooth Extraction", "Wound Repair", "Foreign Body Removal",
        "Eye Surgery", "Orthopedic Surgery", "Emergency Surgery"
    ];

    let note_types = vec![
        "Routine Checkup", "Follow-up Visit", "Behavioral Note", "Diet Consultation",
        "Phone Consultation", "Emergency Visit", "Post-Surgery Check", "Lab Results Review",
        "Medication Adjustment", "Weight Check", "Senior Wellness", "New Patient Exam"
    ];

    let mut created_households = 0i64;
    let mut created_patients = 0i64;
    let mut created_records = 0i64;

    let pool = pool.lock().await;
    println!("[SEED] Database pool acquired");

    // Check current database state
    let initial_check: Result<(i64, i64, i64), _> = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM households) as households,
            (SELECT COUNT(*) FROM patients) as patients,
            (SELECT COUNT(*) FROM medical_records) as records"
    )
    .fetch_one(&*pool)
    .await;

    match initial_check {
        Ok((h, p, r)) => {
            println!("[SEED] Initial DB state: {} households, {} patients, {} records", h, p, r);
        }
        Err(e) => {
            println!("[SEED] WARNING: Could not check initial state: {}", e);
        }
    }

    println!("[SEED] Starting main loop for {} households", households);

    for household_num in 0..households {
        if household_num == 0 {
            println!("[SEED] Starting first iteration (household_num=0)");
        }

        // Progress logging with more detail
        if household_num % 10 == 0 && household_num > 0 {
            println!("[SEED] Progress: {}/{} households ({} patients, {} records so far)",
                    household_num, households, created_patients, created_records);

            // Check actual DB state periodically
            let db_check: Result<(i64, i64, i64), _> = sqlx::query_as(
                "SELECT
                    (SELECT COUNT(*) FROM households) as households,
                    (SELECT COUNT(*) FROM patients) as patients,
                    (SELECT COUNT(*) FROM medical_records) as records"
            )
            .fetch_one(&*pool)
            .await;

            match db_check {
                Ok((h, p, r)) => {
                    println!("[SEED] Actual DB state: {} households, {} patients, {} records", h, p, r);
                    if h != created_households || p != created_patients || r != created_records {
                        println!("[SEED] WARNING: Mismatch between counters and DB state!");
                    }
                }
                Err(e) => {
                    println!("[SEED] WARNING: Could not check DB state: {}", e);
                }
            }
        }

        // Generate realistic household data using faker
        let last_name: String = LastName().fake_with_rng(&mut rng);
        let street_name: String = StreetName().fake_with_rng(&mut rng);
        let building_number: String = BuildingNumber().fake_with_rng(&mut rng);
        let city: String = CityName().fake_with_rng(&mut rng);
        let zip: String = ZipCode().fake_with_rng(&mut rng);
        let address = format!("{} {}", building_number, street_name);

        // Create household
        println!("[SEED] Creating household #{}: {}", household_num + 1, last_name);
        println!("[SEED]   Data: name='{}', address='{}', city='{}', zip='{}'",
                last_name, address, city, zip);

        let res = match sqlx::query(
            "INSERT INTO households (household_name, address, city, postal_code, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&last_name)
        .bind(Some(address.clone()))
        .bind(Some(city.clone()))
        .bind(Some(zip))
        .bind(Option::<String>::None)
        .bind(Utc::now())
        .bind(Utc::now())
        .execute(&*pool)
        .await {
            Ok(res) => {
                println!("[SEED]   -> INSERT successful, rows affected: {}", res.rows_affected());
                res
            },
            Err(e) => {
                println!("[SEED] ERROR: Failed to insert household #{}: {}", household_num + 1, e);
                println!("[SEED] ERROR Details: {:?}", e);

                // Check if households table exists
                let table_check: Result<(i64,), _> = sqlx::query_as(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='households'"
                )
                .fetch_one(&*pool)
                .await;

                match table_check {
                    Ok((count,)) => {
                        if count == 0 {
                            println!("[SEED] ERROR: households table does not exist!");
                        } else {
                            println!("[SEED] ERROR: households table exists");
                        }
                    }
                    Err(e) => println!("[SEED] ERROR: Could not check table existence: {}", e),
                }

                return Err(format!("Failed to insert household: {}", e));
            }
        };

        let household_id = res.last_insert_rowid() as i32;
        if household_id == 0 {
            println!("[SEED] WARNING: Household ID is 0, this might indicate a problem");
        }
        created_households += 1;
        println!("[SEED]   -> Household ID: {} (stored in DB)", household_id);

        // Create 1-5 pets per household
        let pet_count = rng.gen_range(1..=5);
        println!("[SEED]   -> Creating {} pets", pet_count);

        for pet_num in 0..pet_count {
            // Choose a random species from the database
            let (species_id, species_name) = all_species.choose(&mut rng).unwrap();

            // Find breeds for this species
            let species_breeds: Vec<&(i64, String, i64)> = all_breeds
                .iter()
                .filter(|(_, _, sid)| sid == species_id)
                .collect();

            // Choose a breed if available (80% chance)
            let breed_id = if !species_breeds.is_empty() && rng.gen_bool(0.8) {
                let (bid, _, _) = species_breeds.choose(&mut rng).unwrap();
                Some(*bid)
            } else {
                None
            };

            // 80% chance to use human first name from faker, 20% chance for special pet name
            let name = if rng.gen_bool(0.8) {
                FirstName().fake_with_rng(&mut rng)
            } else {
                special_pet_names.choose(&mut rng).unwrap().to_string()
            };
            let gender = Some(genders.choose(&mut rng).unwrap().to_string());

            // Realistic weight ranges based on species name
            let weight = Some(match species_name.as_str() {
                "Dog" => rng.gen_range(5.0..=80.0),
                "Cat" => rng.gen_range(3.0..=15.0),
                "Bird" => rng.gen_range(0.02..=2.0),
                "Rabbit" => rng.gen_range(1.0..=10.0),
                "Hamster" => rng.gen_range(0.02..=0.3),
                "Guinea Pig" => rng.gen_range(0.7..=1.5),
                "Ferret" => rng.gen_range(0.5..=2.5),
                _ => rng.gen_range(0.5..=5.0),
            });

            // Use faker for medical notes
            let notes: Option<String> = if rng.gen_bool(0.3) {
                let sentences: Vec<String> = (0..rng.gen_range(1..=3))
                    .map(|_| Sentence(3..10).fake_with_rng(&mut rng))
                    .collect();
                Some(sentences.join(" "))
            } else {
                None
            };

            let dto = CreatePatientDto {
                name: name.clone(),
                species_id: *species_id,
                breed_id,
                gender,
                date_of_birth: None,
                weight,
                medical_notes: notes,
                household_id: Some(household_id),
            };

            println!("[SEED]      Pet #{}: {} ({}, {}kg)",
                    pet_num + 1, name, species_name,
                    weight.map_or("?".to_string(), |w| format!("{:.2}", w)));

            let patient = match crate::database::queries::patient::create_patient(&*pool, dto).await {
                Ok(p) => p,
                Err(e) => {
                    println!("[SEED] ERROR: Failed to create patient: {}", e);
                    return Err(format!("Failed to create patient: {}", e));
                }
            };
            created_patients += 1;
            println!("[SEED]        -> Patient ID: {}", patient.id);

            // Create medical records - varying amounts per pet
            let has_many_records = rng.gen_bool(0.2); // 20% have extensive history
            let procedure_count = if has_many_records {
                rng.gen_range(5..=15)
            } else {
                rng.gen_range(0..=4)
            };

            if procedure_count > 0 {
                println!("[SEED]        -> Creating {} procedures", procedure_count);
            }

            for proc_num in 0..procedure_count {
                let proc_name = medical_procedures.choose(&mut rng).unwrap();

                // Generate realistic description using faker
                let sentences: Vec<String> = (0..rng.gen_range(2..=4))
                    .map(|_| Sentence(5..15).fake_with_rng(&mut rng))
                    .collect();
                let description = sentences.join(" ");

                // Realistic pricing
                let base_price = if proc_name.contains("Surgery") {
                    rng.gen_range(500.0..=3000.0)
                } else if proc_name.contains("X-Ray") || proc_name.contains("Ultrasound") {
                    rng.gen_range(150.0..=500.0)
                } else if proc_name.contains("Vaccination") || proc_name.contains("Nail") {
                    rng.gen_range(25.0..=150.0)
                } else {
                    rng.gen_range(50.0..=400.0)
                };

                let price = Some((base_price * 100.0_f64).round() / 100.0_f64);
                // Use currency IDs that match the migration: 1=MKD, 2=USD, 3=EUR, 4=GBP
                let currency_id = Some([1i64, 2, 3, 4].choose(&mut rng).copied().unwrap());

                let input = CreateMedicalRecordInput {
                    patient_id: patient.id,
                    record_type: "procedure".to_string(),
                    name: proc_name.to_string(),
                    procedure_name: None,
                    description,
                    price,
                    currency_id,
                };

                match MedicalRecordService::create_medical_record(&*pool, input).await {
                    Ok(_) => {
                        created_records += 1;
                        if proc_num == 0 {
                            println!("[SEED]          Procedure: {} (${:.2})",
                                    proc_name, price.unwrap_or(0.0));
                        }
                    }
                    Err(e) => {
                        println!("[SEED] ERROR: Failed to create procedure for patient {}: {}",
                                patient.id, e);
                        println!("[SEED] ERROR: Patient exists check...");
                        let patient_check: Result<(i64,), _> = sqlx::query_as(
                            "SELECT id FROM patients WHERE id = ?"
                        )
                        .bind(patient.id)
                        .fetch_one(&*pool)
                        .await;
                        match patient_check {
                            Ok((id,)) => println!("[SEED] ERROR: Patient {} exists in DB", id),
                            Err(e) => println!("[SEED] ERROR: Patient {} NOT FOUND: {}", patient.id, e),
                        }
                        return Err(format!("Failed to create procedure: {}", e));
                    }
                }
            }

            // Create notes
            let note_count = if has_many_records {
                rng.gen_range(3..=10)
            } else {
                rng.gen_range(0..=3)
            };

            if note_count > 0 {
                println!("[SEED]        -> Creating {} notes", note_count);
            }

            for _ in 0..note_count {
                let title = note_types.choose(&mut rng).unwrap();
                let sentences: Vec<String> = (0..rng.gen_range(2..=5))
                    .map(|_| Sentence(5..15).fake_with_rng(&mut rng))
                    .collect();
                let description = sentences.join(" ");

                let input = CreateMedicalRecordInput {
                    patient_id: patient.id,
                    record_type: "note".to_string(),
                    name: title.to_string(),
                    procedure_name: None,
                    description,
                    price: None,
                    currency_id: None,
                };

                match MedicalRecordService::create_medical_record(&*pool, input).await {
                    Ok(_) => {
                        created_records += 1;
                    }
                    Err(e) => {
                        println!("[SEED] ERROR: Failed to create note for patient {}: {}", patient.id, e);
                        return Err(format!("Failed to create note: {}", e));
                    }
                }
            }
        }

        // End of household iteration check
        if household_num == households - 1 {
            println!("[SEED] Completed last household iteration (#{}/{})", household_num + 1, households);
        } else if household_num % 100 == 99 {
            println!("[SEED] Completed {} households, continuing...", household_num + 1);
        }
    }

    println!("[SEED] Main loop completed. Created {} households", created_households);

    // Final database verification
    let final_check: Result<(i64, i64, i64), _> = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM households) as households,
            (SELECT COUNT(*) FROM patients) as patients,
            (SELECT COUNT(*) FROM medical_records) as records"
    )
    .fetch_one(&*pool)
    .await;

    let (actual_households, actual_patients, actual_records) = match final_check {
        Ok(counts) => counts,
        Err(e) => {
            println!("[SEED] ERROR: Could not verify final state: {}", e);
            (0, 0, 0)
        }
    };

    println!("\n[SEED] ========================================");
    println!("[SEED] SEEDING COMPLETED");
    println!("[SEED] Counters: {} households, {} patients, {} records",
            created_households, created_patients, created_records);
    println!("[SEED] Database: {} households, {} patients, {} records",
            actual_households, actual_patients, actual_records);

    if actual_households != created_households ||
       actual_patients != created_patients ||
       actual_records != created_records {
        println!("[SEED] WARNING: Mismatch between counters and database!");
        println!("[SEED] This might indicate uncommitted transactions or other issues");
    }

    println!("[SEED] ========================================\n");

    Ok(format!(
        "Database populated! Expected: {} households, {} patients, {} records. Actual in DB: {} households, {} patients, {} records",
        created_households, created_patients, created_records,
        actual_households, actual_patients, actual_records
    ))
}