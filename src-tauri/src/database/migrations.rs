use sqlx::{SqlitePool, Row};

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Create migrations tracking table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    // Run migrations in order
    run_migration(pool, "001_initial_patients", create_patients_table).await?;
    run_migration(pool, "002_households", create_households_table).await?;
    run_migration(pool, "003_people", create_people_table).await?;
    run_migration(pool, "004_person_contacts", create_person_contacts_table).await?;
    run_migration(pool, "005_patient_households", create_patient_households_table).await?;
    run_migration(pool, "006_household_search_fts5", create_household_search_fts5).await?;
    run_migration(pool, "007_add_patient_gender", add_patient_gender).await?;
    run_migration(pool, "008_add_household_location_fields", add_household_location_fields).await?;

    Ok(())
}

async fn run_migration<F>(
    pool: &SqlitePool,
    name: &str,
    migration_fn: F,
) -> Result<(), sqlx::Error>
where
    F: Fn(&SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>>,
{
    // Check if migration has already been executed
    let exists: (i32,) = sqlx::query_as(
        "SELECT COUNT(*) FROM migrations WHERE filename = ?",
    )
    .bind(name)
    .fetch_one(pool)
    .await?;

    if exists.0 == 0 {
        println!("Running migration: {}", name);

        // Execute migration
        migration_fn(pool).await?;

        // Record migration
        sqlx::query(
            "INSERT INTO migrations (filename) VALUES (?)",
        )
        .bind(name)
        .execute(pool)
        .await?;

        println!("Migration {} completed", name);
    }

    Ok(())
}

fn create_patients_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Patients table (unchanged)
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

        // Create update trigger
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

        Ok(())
    })
}

fn create_households_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS households (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                household_name TEXT,
                address TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#)
        .execute(pool)
        .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_households_name ON households(household_name)")
            .execute(pool)
            .await?;

        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_households_timestamp
            AFTER UPDATE ON households
            BEGIN
                UPDATE households SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

fn create_people_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS people (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                household_id INTEGER NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                is_primary BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
            )
        "#)
        .execute(pool)
        .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_people_household ON people(household_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_people_name ON people(last_name, first_name)")
            .execute(pool)
            .await?;

        // Trigger to update timestamp
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_people_timestamp
            AFTER UPDATE ON people
            BEGIN
                UPDATE people SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;
        "#)
        .execute(pool)
        .await?;

        // Trigger to ensure only one primary person per household
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS ensure_one_primary_person
            BEFORE INSERT ON people
            WHEN NEW.is_primary = 1
            BEGIN
                UPDATE people SET is_primary = 0 WHERE household_id = NEW.household_id AND is_primary = 1;
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

fn create_person_contacts_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS person_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id INTEGER NOT NULL,
                contact_type TEXT NOT NULL CHECK(contact_type IN ('phone', 'email', 'mobile', 'work_phone')),
                contact_value TEXT NOT NULL,
                is_primary BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
            )
        "#)
        .execute(pool)
        .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_person_contacts_person ON person_contacts(person_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_person_contacts_value ON person_contacts(contact_value)")
            .execute(pool)
            .await?;

        // Trigger to ensure only one primary contact per type per person
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS ensure_one_primary_contact_per_type
            BEFORE INSERT ON person_contacts
            WHEN NEW.is_primary = 1
            BEGIN
                UPDATE person_contacts
                SET is_primary = 0
                WHERE person_id = NEW.person_id
                AND contact_type = NEW.contact_type
                AND is_primary = 1;
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

fn create_patient_households_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS patient_households (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                household_id INTEGER NOT NULL,
                relationship_type TEXT DEFAULT 'primary_household',
                is_primary BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
                UNIQUE(patient_id, household_id)
            )
        "#)
        .execute(pool)
        .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_patient_households_patient ON patient_households(patient_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_patient_households_household ON patient_households(household_id)")
            .execute(pool)
            .await?;

        // Trigger to ensure only one primary household per patient
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS ensure_one_primary_household
            BEFORE INSERT ON patient_households
            WHEN NEW.is_primary = 1
            BEGIN
                UPDATE patient_households
                SET is_primary = 0
                WHERE patient_id = NEW.patient_id
                AND is_primary = 1;
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

fn create_household_search_fts5(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create FTS5 virtual table
        sqlx::query(r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS household_search USING fts5(
                household_id UNINDEXED,
                household_name,
                address,
                people_names,
                contact_values,
                display_name,
                tokenize = 'porter',
                prefix = '2,3,4'
            )
        "#)
        .execute(pool)
        .await?;

        // Trigger to maintain search index when household is inserted
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS household_search_insert
            AFTER INSERT ON households
            BEGIN
                INSERT INTO household_search (
                    household_id,
                    household_name,
                    address,
                    people_names,
                    contact_values,
                    display_name
                )
                VALUES (
                    NEW.id,
                    IFNULL(NEW.household_name, ''),
                    IFNULL(NEW.address, ''),
                    '',
                    '',
                    IFNULL(NEW.household_name, 'Household ' || NEW.id)
                );
            END;
        "#)
        .execute(pool)
        .await?;

        // Trigger to update search index when people are added
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS people_update_search_insert
            AFTER INSERT ON people
            BEGIN
                UPDATE household_search
                SET people_names = (
                    SELECT GROUP_CONCAT(first_name || ' ' || last_name, ' ')
                    FROM people WHERE household_id = NEW.household_id
                ),
                display_name = CASE
                    WHEN (SELECT household_name FROM households WHERE id = NEW.household_id) IS NOT NULL
                    THEN (SELECT household_name FROM households WHERE id = NEW.household_id)
                    ELSE (
                        SELECT CASE
                            WHEN COUNT(*) = 1 THEN MIN(first_name || ' ' || last_name)
                            WHEN COUNT(*) = 2 THEN GROUP_CONCAT(last_name, ' & ')
                            ELSE (SELECT household_name FROM households WHERE id = NEW.household_id)
                        END
                        FROM people WHERE household_id = NEW.household_id
                    )
                END
                WHERE household_id = NEW.household_id;
            END;
        "#)
        .execute(pool)
        .await?;

        // Trigger to update search index when contacts are added
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS contacts_update_search_insert
            AFTER INSERT ON person_contacts
            BEGIN
                UPDATE household_search
                SET contact_values = (
                    SELECT GROUP_CONCAT(pc.contact_value, ' ')
                    FROM person_contacts pc
                    JOIN people p ON pc.person_id = p.id
                    WHERE p.household_id = (SELECT household_id FROM people WHERE id = NEW.person_id)
                )
                WHERE household_id = (SELECT household_id FROM people WHERE id = NEW.person_id);
            END;
        "#)
        .execute(pool)
        .await?;

        // Trigger to clean up search index on household deletion
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS household_search_delete
            AFTER DELETE ON households
            BEGIN
                DELETE FROM household_search WHERE household_id = OLD.id;
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

// Migration 007: Add gender column to patients table
fn add_patient_gender(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Add gender column to patients table
        sqlx::query(r#"
            ALTER TABLE patients
            ADD COLUMN gender TEXT CHECK(gender IN ('Male', 'Female', 'Unknown') OR gender IS NULL)
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

fn add_household_location_fields(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Check if columns already exist first
        let table_info = sqlx::query("PRAGMA table_info(households)")
            .fetch_all(pool)
            .await?;

        let has_city = table_info.iter().any(|row| {
            row.get::<String, _>("name") == "city"
        });

        let has_postal_code = table_info.iter().any(|row| {
            row.get::<String, _>("name") == "postal_code"
        });

        // Add city column if it doesn't exist
        if !has_city {
            sqlx::query("ALTER TABLE households ADD COLUMN city TEXT")
                .execute(pool)
                .await?;
        }

        // Add postal_code column if it doesn't exist
        if !has_postal_code {
            sqlx::query("ALTER TABLE households ADD COLUMN postal_code TEXT")
                .execute(pool)
                .await?;
        }

        // Create indexes for new fields
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_households_city ON households(city)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_households_postal ON households(postal_code)")
            .execute(pool)
            .await?;

        Ok(())
    })
}

// Keep old functions for backward compatibility but mark as deprecated
#[deprecated(note = "Use run_migrations instead")]
pub async fn create_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    run_migrations(pool).await
}