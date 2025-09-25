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
                theme TEXT DEFAULT 'light' CHECK(theme IN ('light', 'dark')),
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

// Keep old functions for backward compatibility but mark as deprecated
#[deprecated(note = "Use run_migrations instead")]
pub async fn create_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    run_migrations(pool).await
}
