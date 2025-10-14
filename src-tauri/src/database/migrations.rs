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
    run_migration(pool, "009_create_currencies_table", create_currencies_table).await?;
    run_migration(pool, "010_create_medical_records_table", create_medical_records_table).await?;
    run_migration(pool, "011_create_medical_attachments_table", create_medical_attachments_table).await?;
    run_migration(pool, "012_create_medical_record_history_table", create_medical_record_history_table).await?;
    run_migration(pool, "013_create_medical_records_fts", create_medical_records_fts).await?;
    run_migration(pool, "014_fix_medical_triggers", fix_medical_triggers).await?;
    // Dev task: drop and recreate ONLY the medical_record_history table to switch to snapshot strategy
    run_migration(pool, "015_recreate_medical_record_history", recreate_medical_record_history).await?;
    run_migration(pool, "016_add_missing_patient_columns", add_missing_patient_columns).await?;
    run_migration(pool, "017_create_app_settings_table", create_app_settings_table).await?;
    run_migration(pool, "018_create_appointments_tables", create_appointments_tables).await?;
    run_migration(pool, "019_create_update_preferences_table", create_update_preferences_table).await?;
    run_migration(pool, "020_create_calendar_event_mappings", create_calendar_event_mappings_table).await?;
    run_migration(pool, "021_create_sync_logs", create_sync_logs_table).await?;
    run_migration(pool, "022_add_token_expires_at", add_token_expires_at_column).await?;
    run_migration(pool, "023_create_species_table", create_species_table).await?;
    run_migration(pool, "024_add_room_color", add_room_color_column).await?;
    run_migration(pool, "025_create_breeds_table", create_breeds_table).await?;
    run_migration(pool, "026_add_species_color", add_species_color_column).await?;
    run_migration(pool, "027_convert_patient_species_breed_to_fk", convert_patient_species_breed_to_fk).await?;
    run_migration(pool, "028_create_device_integrations_table", create_device_integrations_table).await?;
    run_migration(pool, "029_add_device_metadata_to_attachments", add_device_metadata_to_attachments).await?;

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

// Migration 009: Create currencies table
fn create_currencies_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create currencies table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS currencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                symbol TEXT
            )
        "#)
        .execute(pool)
        .await?;

        // Insert default currencies with specific IDs to match the seeding code expectations
        sqlx::query(r#"
            INSERT OR IGNORE INTO currencies (id, code, name, symbol) VALUES
                (1, 'MKD', 'Macedonian Denar', 'ден'),
                (2, 'USD', 'US Dollar', '$'),
                (3, 'EUR', 'Euro', '€'),
                (4, 'GBP', 'British Pound', '£')
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

// Migration 010: Create medical_records table
fn create_medical_records_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS medical_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                record_type TEXT NOT NULL CHECK(record_type IN ('procedure', 'note')),
                name TEXT NOT NULL CHECK(length(name) <= 200),
                procedure_name TEXT CHECK(procedure_name IS NULL OR length(procedure_name) <= 200),
                description TEXT NOT NULL,
                price DECIMAL(10,2),
                currency_id INTEGER,
                is_archived BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_by TEXT,
                version INTEGER DEFAULT 1,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (currency_id) REFERENCES currencies(id)
            )
        "#)
        .execute(pool)
        .await?;

        // Create indexes
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_medical_records_archived ON medical_records(is_archived)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_medical_records_created_at ON medical_records(created_at DESC)")
            .execute(pool)
            .await?;

        // Update trigger for updated_at
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS medical_records_updated_at
            AFTER UPDATE ON medical_records
            BEGIN
                UPDATE medical_records SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END;
        "#)
        .execute(pool)
        .await?;

        // Version increment trigger
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS medical_records_version
            AFTER UPDATE ON medical_records
            WHEN OLD.version = NEW.version
            BEGIN
                UPDATE medical_records SET version = version + 1
                WHERE id = NEW.id;
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

// Migration 011: Create medical_attachments table
fn create_medical_attachments_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS medical_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medical_record_id INTEGER NOT NULL,
                file_id TEXT NOT NULL UNIQUE,
                original_name TEXT NOT NULL,
                file_size INTEGER,
                mime_type TEXT,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
            )
        "#)
        .execute(pool)
        .await?;

        // Create index
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_medical_attachments_record_id ON medical_attachments(medical_record_id)")
            .execute(pool)
            .await?;

        Ok(())
    })
}

// Migration 012: Create medical_record_history table
fn create_medical_record_history_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS medical_record_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medical_record_id INTEGER NOT NULL,
                version INTEGER NOT NULL,
                changed_fields TEXT,
                old_values TEXT,
                new_values TEXT,
                changed_by TEXT,
                changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
            )
        "#)
        .execute(pool)
        .await?;

        // Create index
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_medical_history_record_id ON medical_record_history(medical_record_id)")
            .execute(pool)
            .await?;

        // Create history trigger
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS medical_records_history_log
            AFTER UPDATE ON medical_records
            BEGIN
                INSERT INTO medical_record_history (
                    medical_record_id, version, changed_by
                )
                VALUES (
                    NEW.id,
                    NEW.version,
                    NEW.updated_by
                );
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

// Migration 013: Create medical_records_fts FTS5 table
fn create_medical_records_fts(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create FTS5 virtual table
        sqlx::query(r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS medical_records_fts USING fts5(
                name,
                procedure_name,
                description,
                content=medical_records,
                content_rowid=id
            )
        "#)
        .execute(pool)
        .await?;

        // Trigger for INSERT
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS medical_records_fts_insert
            AFTER INSERT ON medical_records
            BEGIN
                INSERT INTO medical_records_fts(rowid, name, procedure_name, description)
                VALUES (new.id, new.name, new.procedure_name, new.description);
            END;
        "#)
        .execute(pool)
        .await?;

        // Trigger for UPDATE
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS medical_records_fts_update
            AFTER UPDATE ON medical_records
            BEGIN
                UPDATE medical_records_fts
                SET name = new.name,
                    procedure_name = new.procedure_name,
                    description = new.description
                WHERE rowid = new.id;
            END;
        "#)
        .execute(pool)
        .await?;

        // Trigger for DELETE
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS medical_records_fts_delete
            AFTER DELETE ON medical_records
            BEGIN
                DELETE FROM medical_records_fts WHERE rowid = old.id;
            END;
        "#)
        .execute(pool)
        .await?;

        Ok(())
    })
}

// Migration 014: Fix medical triggers (remove updated_at recursion, enrich history)
fn fix_medical_triggers(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Drop old triggers if they exist
        sqlx::query("DROP TRIGGER IF EXISTS medical_records_updated_at")
            .execute(pool)
            .await?;

        sqlx::query("DROP TRIGGER IF EXISTS medical_records_history_log")
            .execute(pool)
            .await?;
        // We rely on the application layer to insert complete snapshot entries into
        // medical_record_history, so we intentionally do not recreate history triggers here.
        // FTS triggers remain handled in earlier migrations.
        Ok(())
    })
}

// Migration 015: Recreate medical_record_history table with snapshot-friendly schema
// This will DROP the table and all its data, then recreate it cleanly.
fn recreate_medical_record_history(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Drop existing table (data loss intended per request)
        sqlx::query("DROP TABLE IF EXISTS medical_record_history")
            .execute(pool)
            .await?;

        // Recreate table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS medical_record_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medical_record_id INTEGER NOT NULL,
                version INTEGER NOT NULL,
                changed_fields TEXT,
                old_values TEXT,
                new_values TEXT,
                changed_by TEXT,
                changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
            )
        "#)
        .execute(pool)
        .await?;

        // Index for lookups by record
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_medical_history_record_id ON medical_record_history(medical_record_id)")
            .execute(pool)
            .await?;

        Ok(())
    })
}

// Migration 016: Add missing columns to patients table used by queries/models
fn add_missing_patient_columns(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Helper to check and add a column
        async fn ensure_column(pool: &SqlitePool, table: &str, column: &str, ddl: &str) -> Result<(), sqlx::Error> {
            let exists: (i64,) = sqlx::query_as(
                "SELECT COUNT(1) FROM pragma_table_info(?) WHERE name = ?"
            )
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await?;

            if exists.0 == 0 {
                let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, ddl);
                // NOTE: SQLite only supports limited ALTER; this form is safe for simple adds
                sqlx::query(&sql).execute(pool).await?;
            }
            Ok(())
        }

        // Add gender (TEXT) if missing
        ensure_column(pool, "patients", "gender", "TEXT").await?;
        // Add color (TEXT) if missing
        ensure_column(pool, "patients", "color", "TEXT").await?;
        // Add microchip_id (TEXT) if missing
        ensure_column(pool, "patients", "microchip_id", "TEXT").await?;
        // Add is_active (BOOLEAN) if missing, default to 1
        // SQLite treats BOOLEAN as NUMERIC; default only applies to new rows
        ensure_column(pool, "patients", "is_active", "BOOLEAN DEFAULT 1").await?;

        Ok(())
    })
}

fn create_app_settings_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create app_settings table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'default',
                language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'mk')),
                currency_id INTEGER,
                theme TEXT DEFAULT 'dark' CHECK(theme IN ('light', 'dark')),
                date_format TEXT DEFAULT 'MM/DD/YYYY',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (currency_id) REFERENCES currencies(id),
                UNIQUE(user_id)
            )
            "#,
        )
        .execute(pool)
        .await?;

        // Create index for fast user lookups
        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_app_settings_user_id ON app_settings(user_id)
            "#,
        )
        .execute(pool)
        .await?;

        // Insert default settings with USD currency if available
        sqlx::query(
            r#"
            INSERT INTO app_settings (user_id, language, currency_id)
            SELECT 'default', 'en', id
            FROM currencies
            WHERE code = 'USD'
            LIMIT 1
            ON CONFLICT(user_id) DO NOTHING
            "#,
        )
        .execute(pool)
        .await?;

        // If USD not found, insert without default currency
        sqlx::query(
            r#"
            INSERT INTO app_settings (user_id, language)
            SELECT 'default', 'en'
            WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE user_id = 'default')
            "#,
        )
        .execute(pool)
        .await?;

        println!("Created app_settings table");
        Ok(())
    })
}

// Migration 018: Create appointments management tables
fn create_appointments_tables(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create rooms table for appointment locations
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                capacity INTEGER DEFAULT 1 CHECK (capacity >= 1),
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        "#)
        .execute(pool)
        .await?;

        // Create appointments table with soft deletion
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                title TEXT NOT NULL CHECK (length(title) <= 200),
                description TEXT,
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP NOT NULL,
                room_id INTEGER,
                status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP,
                created_by TEXT NOT NULL,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
                CHECK (end_time > start_time)
            )
        "#)
        .execute(pool)
        .await?;

        // Create Google Calendar settings table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS google_calendar_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE DEFAULT 'default',
                access_token TEXT,
                refresh_token TEXT,
                calendar_id TEXT,
                sync_enabled BOOLEAN DEFAULT 0,
                last_sync TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        "#)
        .execute(pool)
        .await?;

        // Create appointment sync log table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS appointment_sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                appointment_id INTEGER NOT NULL,
                external_id TEXT,
                sync_action TEXT NOT NULL CHECK (sync_action IN ('create', 'update', 'delete')),
                sync_status TEXT NOT NULL CHECK (sync_status IN ('success', 'failed', 'pending')),
                error_message TEXT,
                synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
            )
        "#)
        .execute(pool)
        .await?;

        // Create indexes for performance
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(start_time) WHERE deleted_at IS NULL")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id) WHERE deleted_at IS NULL")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_appointments_room_id ON appointments(room_id) WHERE deleted_at IS NULL")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_appointments_room_schedule ON appointments(room_id, start_time, end_time) WHERE deleted_at IS NULL AND status != 'cancelled'")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status) WHERE deleted_at IS NULL")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_log_appointment ON appointment_sync_log(appointment_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_log_external ON appointment_sync_log(external_id)")
            .execute(pool)
            .await?;

        // Triggers for updated_at timestamps
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_appointments_timestamp
            AFTER UPDATE ON appointments
            FOR EACH ROW
            WHEN NEW.updated_at = OLD.updated_at
            BEGIN
                UPDATE appointments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_rooms_timestamp
            AFTER UPDATE ON rooms
            FOR EACH ROW
            WHEN NEW.updated_at = OLD.updated_at
            BEGIN
                UPDATE rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_google_calendar_settings_timestamp
            AFTER UPDATE ON google_calendar_settings
            FOR EACH ROW
            WHEN NEW.updated_at = OLD.updated_at
            BEGIN
                UPDATE google_calendar_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        // Insert default rooms
        sqlx::query(r#"
            INSERT OR IGNORE INTO rooms (name, description, capacity, is_active) VALUES
                ('Exam Room 1', 'General examination room', 1, 1),
                ('Exam Room 2', 'General examination room', 1, 1),
                ('Surgery Room', 'Surgical procedures', 1, 1),
                ('Dental Suite', 'Dental procedures', 1, 1),
                ('Grooming Station', 'Grooming and bathing', 2, 1)
        "#)
        .execute(pool)
        .await?;

        // Insert default Google Calendar settings
        sqlx::query(r#"
            INSERT OR IGNORE INTO google_calendar_settings (user_id, sync_enabled)
            VALUES ('default', 0)
        "#)
        .execute(pool)
        .await?;

        println!("Created appointments management tables");
        Ok(())
    })
}

fn create_update_preferences_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create update_preferences table for auto-update system
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS update_preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                auto_check_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                last_check_timestamp INTEGER,
                last_notified_version TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        "#)
        .execute(pool)
        .await?;

        // Insert default preferences (singleton pattern - only one row allowed)
        sqlx::query(r#"
            INSERT OR IGNORE INTO update_preferences (
                id,
                auto_check_enabled,
                created_at,
                updated_at
            )
            VALUES (
                1,
                TRUE,
                strftime('%s', 'now'),
                strftime('%s', 'now')
            )
        "#)
        .execute(pool)
        .await?;

        // Index for efficient lookups (though only 1 row exists)
        sqlx::query(r#"
            CREATE INDEX IF NOT EXISTS idx_update_preferences_auto_check
            ON update_preferences(auto_check_enabled)
        "#)
        .execute(pool)
        .await?;

        println!("Created update_preferences table");
        Ok(())
    })
}

// T001: Create calendar_event_mappings table
fn create_calendar_event_mappings_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create calendar_event_mappings table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS calendar_event_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                appointment_id INTEGER NOT NULL UNIQUE,
                event_id TEXT NOT NULL,
                calendar_id TEXT NOT NULL,
                last_synced_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
            )
        "#)
        .execute(pool)
        .await?;

        // Create indexes
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_appointment ON calendar_event_mappings(appointment_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_event ON calendar_event_mappings(event_id)")
            .execute(pool)
            .await?;

        // Create update trigger
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_calendar_event_mappings_timestamp
            AFTER UPDATE ON calendar_event_mappings
            BEGIN
                UPDATE calendar_event_mappings
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        println!("Created calendar_event_mappings table with indexes and trigger");
        Ok(())
    })
}

// T002: Create sync_logs table
fn create_sync_logs_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create sync_logs table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS sync_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                direction TEXT NOT NULL CHECK (direction IN ('to_google', 'from_google')),
                sync_type TEXT NOT NULL CHECK (sync_type IN ('initial', 'incremental', 'manual')),
                status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'partial')),
                items_synced INTEGER DEFAULT 0,
                items_failed INTEGER DEFAULT 0,
                error_message TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        "#)
        .execute(pool)
        .await?;

        // Create indexes
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status, started_at)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON sync_logs(sync_type, completed_at)")
            .execute(pool)
            .await?;

        println!("Created sync_logs table with indexes");
        Ok(())
    })
}

// T003: Add token_expires_at column to google_calendar_settings
fn add_token_expires_at_column(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Check if column already exists
        let column_exists: bool = sqlx::query_scalar(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('google_calendar_settings') WHERE name = 'token_expires_at'"
        )
        .fetch_one(pool)
        .await?;

        if !column_exists {
            sqlx::query("ALTER TABLE google_calendar_settings ADD COLUMN token_expires_at TIMESTAMP")
                .execute(pool)
                .await?;
            println!("Added token_expires_at column to google_calendar_settings");
        } else {
            println!("token_expires_at column already exists in google_calendar_settings");
        }

        Ok(())
    })
}

// T023: Create species table
fn create_species_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create species table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS species (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                active BOOLEAN NOT NULL DEFAULT 1,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        "#)
        .execute(pool)
        .await?;

        // Insert default species
        sqlx::query(r#"
            INSERT OR IGNORE INTO species (name, display_order) VALUES
                ('Dog', 1),
                ('Cat', 2),
                ('Bird', 3),
                ('Rabbit', 4),
                ('Hamster', 5),
                ('Guinea Pig', 6),
                ('Reptile', 7),
                ('Fish', 8),
                ('Other', 9)
        "#)
        .execute(pool)
        .await?;

        // Create index on active species
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_species_active ON species(active)")
            .execute(pool)
            .await?;

        // Create trigger for updated_at
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_species_timestamp
            AFTER UPDATE ON species
            BEGIN
                UPDATE species SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        println!("Created species table with default data");
        Ok(())
    })
}

fn add_room_color_column(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Add color column to rooms table with a default value
        sqlx::query("ALTER TABLE rooms ADD COLUMN color TEXT NOT NULL DEFAULT '#000000'")
            .execute(pool)
            .await?;

        println!("Added color column to rooms table");
        Ok(())
    })
}

// T025: Create breeds table
fn create_breeds_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create breeds table with foreign key to species
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS breeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                species_id INTEGER NOT NULL,
                active BOOLEAN NOT NULL DEFAULT 1,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (species_id) REFERENCES species(id),
                UNIQUE(name, species_id)
            )
        "#)
        .execute(pool)
        .await?;

        // Create index on species_id and active
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_breeds_species_id ON breeds(species_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_breeds_active ON breeds(active)")
            .execute(pool)
            .await?;

        // Create trigger for updated_at
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_breeds_timestamp
            AFTER UPDATE ON breeds
            BEGIN
                UPDATE breeds SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        println!("Created breeds table");
        Ok(())
    })
}

// T026: Add color column to species table
fn add_species_color_column(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Add color column to species table
        sqlx::query("ALTER TABLE species ADD COLUMN color TEXT NOT NULL DEFAULT '#1890ff'")
            .execute(pool)
            .await?;

        // Update colors for existing species with distinctive colors
        sqlx::query("UPDATE species SET color = '#1890ff' WHERE name = 'Dog'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#ff7a45' WHERE name = 'Cat'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#52c41a' WHERE name = 'Bird'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#fa8c16' WHERE name = 'Rabbit'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#fadb14' WHERE name = 'Hamster'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#13c2c2' WHERE name = 'Guinea Pig'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#722ed1' WHERE name = 'Reptile'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#2f54eb' WHERE name = 'Fish'")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE species SET color = '#8c8c8c' WHERE name = 'Other'")
            .execute(pool)
            .await?;

        println!("Added color column to species table");
        Ok(())
    })
}

fn convert_patient_species_breed_to_fk(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Check if species_id already exists
        let column_check: Result<(i64,), _> = sqlx::query_as(
            "SELECT COUNT(*) FROM pragma_table_info('patients') WHERE name = 'species_id'"
        )
        .fetch_one(pool)
        .await;

        let species_id_exists = match column_check {
            Ok((count,)) => count > 0,
            Err(_) => false,
        };

        if species_id_exists {
            println!("Migration 027: species_id already exists, skipping column creation");
            return Ok(());
        }

        // Step 1: Add new foreign key columns
        sqlx::query("ALTER TABLE patients ADD COLUMN species_id INTEGER")
            .execute(pool)
            .await?;

        sqlx::query("ALTER TABLE patients ADD COLUMN breed_id INTEGER")
            .execute(pool)
            .await?;

        // Step 2: Migrate existing species data
        // Update species_id based on matching species names
        sqlx::query(r#"
            UPDATE patients
            SET species_id = (
                SELECT s.id
                FROM species s
                WHERE s.name = patients.species
            )
            WHERE species IS NOT NULL
        "#)
        .execute(pool)
        .await?;

        // Step 3: Migrate existing breed data
        // For breeds, we need to match both breed name AND species
        sqlx::query(r#"
            UPDATE patients
            SET breed_id = (
                SELECT b.id
                FROM breeds b
                INNER JOIN species s ON b.species_id = s.id
                WHERE b.name = patients.breed
                AND s.name = patients.species
            )
            WHERE breed IS NOT NULL
        "#)
        .execute(pool)
        .await?;

        // Step 4: Create backup columns for old data (for safety)
        sqlx::query("ALTER TABLE patients ADD COLUMN species_backup TEXT")
            .execute(pool)
            .await?;

        sqlx::query("ALTER TABLE patients ADD COLUMN breed_backup TEXT")
            .execute(pool)
            .await?;

        // Step 5: Backup old text values
        sqlx::query("UPDATE patients SET species_backup = species")
            .execute(pool)
            .await?;

        sqlx::query("UPDATE patients SET breed_backup = breed")
            .execute(pool)
            .await?;

        // Step 6: Create new patients table with foreign keys
        sqlx::query(r#"
            CREATE TABLE patients_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL CHECK(length(name) <= 100),
                species_id INTEGER NOT NULL,
                breed_id INTEGER,
                date_of_birth DATE,
                color TEXT,
                gender TEXT CHECK(gender IN ('Male', 'Female', 'Unknown')),
                weight DECIMAL(6,2) CHECK(weight IS NULL OR weight > 0),
                microchip_id TEXT CHECK(microchip_id IS NULL OR length(microchip_id) <= 50),
                medical_notes TEXT CHECK(medical_notes IS NULL OR length(medical_notes) <= 10000),
                is_active BOOLEAN NOT NULL DEFAULT 1,
                household_id INTEGER,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (species_id) REFERENCES species(id),
                FOREIGN KEY (breed_id) REFERENCES breeds(id),
                FOREIGN KEY (household_id) REFERENCES households(id)
            )
        "#)
        .execute(pool)
        .await?;

        // Step 7: Copy data to new table (only records with valid species_id)
        sqlx::query(r#"
            INSERT INTO patients_new (
                id, name, species_id, breed_id, date_of_birth, color,
                gender, weight, microchip_id, medical_notes, is_active,
                household_id, created_at, updated_at
            )
            SELECT
                id, name, species_id, breed_id, date_of_birth, color,
                gender, weight, microchip_id, medical_notes, is_active,
                household_id, created_at, updated_at
            FROM patients
            WHERE species_id IS NOT NULL
        "#)
        .execute(pool)
        .await?;

        // Step 8: Drop old table and rename new one
        sqlx::query("DROP TABLE patients")
            .execute(pool)
            .await?;

        sqlx::query("ALTER TABLE patients_new RENAME TO patients")
            .execute(pool)
            .await?;

        // Step 9: Recreate indexes
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_patients_species_id ON patients(species_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_patients_breed_id ON patients(breed_id)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_patients_household_id ON patients(household_id)")
            .execute(pool)
            .await?;

        // Step 10: Recreate update trigger
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_patients_timestamp
            AFTER UPDATE ON patients
            BEGIN
                UPDATE patients SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        println!("Converted patient species and breed to foreign keys");
        Ok(())
    })
}

// T028: Create device_integrations table
fn create_device_integrations_table(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Create device_integrations table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS device_integrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                device_type TEXT NOT NULL CHECK(device_type IN ('exigo_eos_vet', 'healvet_hv_fia_3000', 'mnchip_pointcare_pcr_v1')),
                connection_type TEXT NOT NULL CHECK(connection_type IN ('file_watch', 'serial_port', 'hl7_tcp')),
                watch_directory TEXT,
                file_pattern TEXT,
                serial_port_name TEXT,
                serial_baud_rate INTEGER DEFAULT 9600,
                tcp_host TEXT,
                tcp_port INTEGER,
                enabled INTEGER DEFAULT 1 CHECK(enabled IN (0, 1)),
                last_connected_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT
            )
        "#)
        .execute(pool)
        .await?;

        // Create indexes
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_device_integrations_device_type ON device_integrations(device_type)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_device_integrations_connection_type ON device_integrations(connection_type)")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_device_integrations_enabled ON device_integrations(enabled)")
            .execute(pool)
            .await?;

        // Create trigger for updated_at
        sqlx::query(r#"
            CREATE TRIGGER IF NOT EXISTS update_device_integrations_timestamp
            AFTER UPDATE ON device_integrations
            BEGIN
                UPDATE device_integrations SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END
        "#)
        .execute(pool)
        .await?;

        println!("Created device_integrations table");
        Ok(())
    })
}

// T029: Add device metadata columns to medical_attachments for PDF regeneration
fn add_device_metadata_to_attachments(pool: &SqlitePool) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + '_>> {
    Box::pin(async move {
        // Helper to check and add a column safely
        async fn ensure_column(pool: &SqlitePool, table: &str, column: &str, ddl: &str) -> Result<(), sqlx::Error> {
            let exists: (i64,) = sqlx::query_as(
                "SELECT COUNT(1) FROM pragma_table_info(?) WHERE name = ?"
            )
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await?;

            if exists.0 == 0 {
                let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, ddl);
                sqlx::query(&sql).execute(pool).await?;
            }
            Ok(())
        }

        // Add device metadata columns for PDF regeneration feature
        ensure_column(pool, "medical_attachments", "device_type", "TEXT").await?;
        ensure_column(pool, "medical_attachments", "device_name", "TEXT").await?;
        ensure_column(pool, "medical_attachments", "connection_method", "TEXT").await?;

        println!("Added device metadata columns to medical_attachments table");
        Ok(())
    })
}

// Keep old functions for backward compatibility but mark as deprecated
#[deprecated(note = "Use run_migrations instead")]
pub async fn create_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    run_migrations(pool).await
}
