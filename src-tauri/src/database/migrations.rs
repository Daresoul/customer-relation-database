use sqlx::SqlitePool;

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Create initial schema
    sqlx::query(include_str!("migrations/001_initial_schema.sql"))
        .execute(pool)
        .await?;

    // Create FTS5 search index
    sqlx::query(include_str!("migrations/002_search_index.sql"))
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn create_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Patients table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL CHECK(length(name) <= 100),
            species TEXT NOT NULL CHECK(length(species) <= 50),
            breed TEXT CHECK(breed IS NULL OR length(breed) <= 50),
            date_of_birth DATE,
            weight DECIMAL(6,2) CHECK(weight IS NULL OR weight > 0),
            medical_notes TEXT CHECK(medical_notes IS NULL OR length(medical_notes) <= 10000),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    "#)
    .execute(pool)
    .await?;

    // Owners table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS owners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL CHECK(length(first_name) <= 100),
            last_name TEXT NOT NULL CHECK(length(last_name) <= 100),
            email TEXT UNIQUE CHECK(email IS NULL OR email LIKE '%@%.%'),
            phone TEXT CHECK(phone IS NULL OR length(phone) BETWEEN 10 AND 20),
            address TEXT CHECK(address IS NULL OR length(address) <= 500),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    "#)
    .execute(pool)
    .await?;

    // Patient-Owner relationship table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS patient_owners (
            patient_id INTEGER NOT NULL,
            owner_id INTEGER NOT NULL,
            relationship_type TEXT DEFAULT 'Owner',
            is_primary BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (patient_id, owner_id),
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
        )
    "#)
    .execute(pool)
    .await?;

    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_patients_species ON patients(species)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_patient_owners_patient ON patient_owners(patient_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_patient_owners_owner ON patient_owners(owner_id)")
        .execute(pool)
        .await?;

    // Create update triggers
    sqlx::query(r#"
        CREATE TRIGGER IF NOT EXISTS update_patients_timestamp
        AFTER UPDATE ON patients
        BEGIN
            UPDATE patients SET updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
        END;
    "#)
    .execute(pool)
    .await?;

    sqlx::query(r#"
        CREATE TRIGGER IF NOT EXISTS update_owners_timestamp
        AFTER UPDATE ON owners
        BEGIN
            UPDATE owners SET updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
        END;
    "#)
    .execute(pool)
    .await?;

    Ok(())
}