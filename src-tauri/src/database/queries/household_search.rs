use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};
use crate::models::household::*;

/// `INSERT INTO household_search` of one row per household matching `filter`
/// (an SQL condition on `h`, e.g. `h.id = NEW.id`), built from the live
/// households / people / person_contacts tables. Phone contacts are indexed
/// twice: as typed and with separators removed, so "070123456" finds
/// "070 123 456".
///
/// Migration 046 bakes this into its triggers. Changing it only changes the
/// triggers through a new migration that recreates them.
pub(crate) fn index_rows_sql(filter: &str) -> String {
    format!(
        r#"
        INSERT INTO household_search
            (household_id, household_name, address, people_names, contact_values, display_name)
        SELECT
            h.id,
            COALESCE(h.household_name, ''),
            TRIM(COALESCE(h.address, '') || ' ' || COALESCE(h.city, '') || ' ' || COALESCE(h.postal_code, '')),
            COALESCE((SELECT GROUP_CONCAT(p.first_name || ' ' || p.last_name, ' ')
                      FROM people p WHERE p.household_id = h.id), ''),
            COALESCE((SELECT GROUP_CONCAT(
                          CASE WHEN pc.contact_type IN ('phone', 'mobile', 'work_phone')
                               THEN pc.contact_value || ' ' ||
                                    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                                        pc.contact_value, ' ', ''), '-', ''), '/', ''), '(', ''), ')', ''), '.', '')
                               ELSE pc.contact_value END, ' ')
                      FROM person_contacts pc
                      JOIN people p ON pc.person_id = p.id
                      WHERE p.household_id = h.id), ''),
            COALESCE(NULLIF(TRIM(h.household_name), ''),
                     (SELECT GROUP_CONCAT(p.first_name || ' ' || p.last_name, ' & ')
                      FROM people p WHERE p.household_id = h.id),
                     'Household ' || h.id)
        FROM households h
        WHERE {filter}"#
    )
}

// Turns free text into a safe FTS5 query: each typed word becomes a quoted
// prefix phrase of its alphanumeric parts, so punctuation and FTS5 syntax
// (`-`, `"`, `*`, `:`, NOT, OR, ...) are never parsed as operators. The
// tokenizer splits stored text on the same punctuation, so "070-123-456"
// matches "070 123 456" and "Петровска-Николовска" matches as a phrase. A
// word made only of digit groups also matches the digits run together.
// Words are OR-ed; bm25 ranks households matching more words first.
fn sanitize_fts5_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter_map(|word| {
            let parts: Vec<&str> = word
                .split(|c: char| !c.is_alphanumeric())
                .filter(|p| !p.is_empty())
                .collect();
            if parts.is_empty() {
                return None;
            }
            let phrase = format!("\"{}\"*", parts.join(" "));
            let all_digits = parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()));
            if parts.len() > 1 && all_digits {
                Some(format!("({} OR \"{}\"*)", phrase, parts.concat()))
            } else {
                Some(phrase)
            }
        })
        .collect::<Vec<_>>()
        .join(" OR ")
}

// Helper function to get all households without search
async fn get_all_households_internal(
    db: &DatabaseConnection,
    limit: i32,
    offset: i32,
) -> Result<SearchHouseholdsResponse, String> {
    // Get households directly without FTS5
    let household_rows = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT
            id,
            household_name,
            address
        FROM households
        ORDER BY household_name, id
        LIMIT ? OFFSET ?
        "#,
        [limit.into(), offset.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch households: {}", e))?;

    // Get total count
    let total_row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT COUNT(*) as count
        FROM households
        "#,
        []
    ))
    .await
    .map_err(|e| format!("Failed to count households: {}", e))?
    .ok_or("Failed to count households")?;

    let total: i32 = total_row.try_get("", "count")
        .map_err(|e| format!("Failed to get count: {}", e))?;

    let mut results = Vec::new();

    for row in household_rows {
        let household_id: i64 = row.try_get("", "id")
            .map_err(|e| format!("Failed to get id: {}", e))?;

        // Get people for this household
        let people_rows = db.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.is_primary
            FROM people p
            WHERE p.household_id = ?
            ORDER BY p.is_primary DESC, p.last_name, p.first_name
            "#,
            [household_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch people: {}", e))?;

        let mut people_with_contacts = Vec::new();

        for person_row in people_rows {
            let person_id: i64 = person_row.try_get("", "id")
                .map_err(|e| format!("Failed to get person id: {}", e))?;

            // Get contacts for this person
            let contact_rows = db.query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
                SELECT
                    id,
                    person_id,
                    contact_type,
                    contact_value,
                    is_primary,
                    created_at
                FROM person_contacts
                WHERE person_id = ?
                ORDER BY is_primary DESC, contact_type
                "#,
                [person_id.into()]
            ))
            .await
            .map_err(|e| format!("Failed to fetch contacts: {}", e))?;

            let contacts: Vec<PersonContact> = contact_rows.iter().map(|contact_row| {
                PersonContact {
                    id: contact_row.try_get("", "id").unwrap_or(0),
                    person_id: contact_row.try_get("", "person_id").unwrap_or(0),
                    contact_type: contact_row.try_get("", "contact_type").unwrap_or_default(),
                    contact_value: contact_row.try_get("", "contact_value").unwrap_or_default(),
                    is_primary: contact_row.try_get("", "is_primary").unwrap_or(false),
                    created_at: contact_row.try_get("", "created_at").unwrap_or_default(),
                }
            }).collect();

            people_with_contacts.push(PersonWithContacts {
                id: person_id as i32,
                first_name: person_row.try_get("", "first_name").unwrap_or_default(),
                last_name: person_row.try_get("", "last_name").unwrap_or_default(),
                is_primary: person_row.try_get("", "is_primary").unwrap_or(false),
                contacts,
            });
        }

        // Get pet count for this household
        let pet_count_row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            SELECT COUNT(*) as count
            FROM patient_households
            WHERE household_id = ?
            "#,
            [household_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to count pets: {}", e))?
        .ok_or("Failed to count pets")?;

        let pet_count: i64 = pet_count_row.try_get("", "count")
            .map_err(|e| format!("Failed to get pet count: {}", e))?;

        results.push(HouseholdSearchResult {
            id: household_id as i32,
            household_name: row.try_get("", "household_name").unwrap_or_default(),
            address: row.try_get("", "address").ok(),
            people: people_with_contacts,
            pet_count: pet_count as i32,
            relevance_score: 0.0,
            snippet: None,
        });
    }

    Ok(SearchHouseholdsResponse {
        results,
        total,
        has_more: (offset + limit) < total,
    })
}

// Search households using FTS5
pub async fn search_households(
    db: &DatabaseConnection,
    query: &str,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<SearchHouseholdsResponse, String> {
    let limit = limit.unwrap_or(10).min(100); // Max 100 results
    let offset = offset.unwrap_or(0);

    // Handle empty or too short queries
    if query.trim().is_empty() || query.trim().len() < 2 {
        // For empty queries, return all households (without FTS5 search)
        return get_all_households_internal(db, limit, offset).await;
    }

    let fts_query = sanitize_fts5_query(query);
    if fts_query.is_empty() {
        return Ok(SearchHouseholdsResponse { results: Vec::new(), total: 0, has_more: false });
    }

    // Search using FTS5
    let search_results = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT
            h.id,
            h.household_name,
            h.address,
            bm25(household_search) as relevance_score,
            snippet(household_search, -1, '<mark>', '</mark>', '...', 32) as snippet
        FROM household_search
        JOIN households h ON household_search.household_id = h.id
        WHERE household_search MATCH ?
        ORDER BY relevance_score
        LIMIT ? OFFSET ?
        "#,
        [fts_query.clone().into(), limit.into(), offset.into()]
    ))
    .await
    .map_err(|e| format!("Failed to search households: {}", e))?;

    // Get total count
    let total_row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT COUNT(*) as count
        FROM household_search
        WHERE household_search MATCH ?
        "#,
        [fts_query.into()]
    ))
    .await
    .map_err(|e| format!("Failed to count search results: {}", e))?
    .ok_or("Failed to count search results")?;

    let total: i32 = total_row.try_get("", "count")
        .map_err(|e| format!("Failed to get count: {}", e))?;

    let mut results = Vec::new();

    for row in search_results {
        let household_id: i64 = row.try_get("", "id")
            .map_err(|e| format!("Failed to get id: {}", e))?;

        // Get people for this household
        let people_rows = db.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.is_primary
            FROM people p
            WHERE p.household_id = ?
            ORDER BY p.is_primary DESC, p.last_name, p.first_name
            "#,
            [household_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch people: {}", e))?;

        let mut people_with_contacts = Vec::new();

        for person_row in people_rows {
            let person_id: i64 = person_row.try_get("", "id")
                .map_err(|e| format!("Failed to get person id: {}", e))?;

            // Get contacts for this person
            let contact_rows = db.query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
                SELECT
                    id,
                    person_id,
                    contact_type,
                    contact_value,
                    is_primary,
                    created_at
                FROM person_contacts
                WHERE person_id = ?
                ORDER BY is_primary DESC, contact_type
                "#,
                [person_id.into()]
            ))
            .await
            .map_err(|e| format!("Failed to fetch contacts: {}", e))?;

            let contacts: Vec<PersonContact> = contact_rows.iter().map(|contact_row| {
                PersonContact {
                    id: contact_row.try_get("", "id").unwrap_or(0),
                    person_id: contact_row.try_get("", "person_id").unwrap_or(0),
                    contact_type: contact_row.try_get("", "contact_type").unwrap_or_default(),
                    contact_value: contact_row.try_get("", "contact_value").unwrap_or_default(),
                    is_primary: contact_row.try_get("", "is_primary").unwrap_or(false),
                    created_at: contact_row.try_get("", "created_at").unwrap_or_default(),
                }
            }).collect();

            people_with_contacts.push(PersonWithContacts {
                id: person_id as i32,
                first_name: person_row.try_get("", "first_name").unwrap_or_default(),
                last_name: person_row.try_get("", "last_name").unwrap_or_default(),
                is_primary: person_row.try_get("", "is_primary").unwrap_or(false),
                contacts,
            });
        }

        // Get pet count for this household
        let pet_count_row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            SELECT COUNT(*) as count
            FROM patient_households
            WHERE household_id = ?
            "#,
            [household_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to count pets: {}", e))?
        .ok_or("Failed to count pets")?;

        let pet_count: i64 = pet_count_row.try_get("", "count")
            .map_err(|e| format!("Failed to get pet count: {}", e))?;

        results.push(HouseholdSearchResult {
            id: household_id as i32,
            household_name: row.try_get("", "household_name").unwrap_or_default(),
            address: row.try_get("", "address").ok(),
            people: people_with_contacts,
            pet_count: pet_count as i32,
            relevance_score: row.try_get("", "relevance_score").unwrap_or(0.0),
            snippet: row.try_get("", "snippet").ok(),
        });
    }

    let has_more = (offset + limit) < total;

    Ok(SearchHouseholdsResponse {
        results,
        total,
        has_more,
    })
}

// Quick search for autocomplete (lighter weight)
pub async fn quick_search_households(
    db: &DatabaseConnection,
    query: &str,
    limit: i32,
) -> Result<Vec<(i32, String)>, String> {
    let fts_query = sanitize_fts5_query(query);
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.min(20);

    let results = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT
            household_id,
            display_name
        FROM household_search
        WHERE household_search MATCH ?
        ORDER BY bm25(household_search)
        LIMIT ?
        "#,
        [fts_query.into(), limit.into()]
    ))
    .await
    .map_err(|e| format!("Failed to quick search households: {}", e))?;

    Ok(results
        .iter()
        .map(|r| {
            let id: i64 = r.try_get("", "household_id").unwrap_or(0);
            let name: Option<String> = r.try_get("", "display_name").ok();
            (id as i32, name.unwrap_or_default())
        })
        .collect())
}

// Search households by contact value (phone, email)
#[allow(dead_code)]
pub async fn search_households_by_contact(
    db: &DatabaseConnection,
    contact_value: &str,
) -> Result<Vec<HouseholdSearchResult>, String> {
    let search_pattern = format!("%{}%", contact_value);

    let household_rows = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT DISTINCT h.id, h.household_name, h.address
        FROM households h
        JOIN people p ON p.household_id = h.id
        JOIN person_contacts pc ON pc.person_id = p.id
        WHERE pc.contact_value LIKE ?
        LIMIT 10
        "#,
        [search_pattern.into()]
    ))
    .await
    .map_err(|e| format!("Failed to search by contact: {}", e))?;

    let mut results = Vec::new();

    for household_row in household_rows {
        let household_id: i64 = household_row.try_get("", "id")
            .map_err(|e| format!("Failed to get id: {}", e))?;

        // Get all people for this household
        let people_rows = db.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.is_primary
            FROM people p
            WHERE p.household_id = ?
            ORDER BY p.is_primary DESC, p.last_name, p.first_name
            "#,
            [household_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch people: {}", e))?;

        let mut people_with_contacts = Vec::new();

        for person_row in people_rows {
            let person_id: i64 = person_row.try_get("", "id")
                .map_err(|e| format!("Failed to get person id: {}", e))?;

            let contact_rows = db.query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
                SELECT
                    id,
                    person_id,
                    contact_type,
                    contact_value,
                    is_primary,
                    created_at
                FROM person_contacts
                WHERE person_id = ?
                ORDER BY is_primary DESC, contact_type
                "#,
                [person_id.into()]
            ))
            .await
            .map_err(|e| format!("Failed to fetch contacts: {}", e))?;

            let contacts: Vec<PersonContact> = contact_rows.iter().map(|contact_row| {
                PersonContact {
                    id: contact_row.try_get("", "id").unwrap_or(0),
                    person_id: contact_row.try_get("", "person_id").unwrap_or(0),
                    contact_type: contact_row.try_get("", "contact_type").unwrap_or_default(),
                    contact_value: contact_row.try_get("", "contact_value").unwrap_or_default(),
                    is_primary: contact_row.try_get("", "is_primary").unwrap_or(false),
                    created_at: contact_row.try_get("", "created_at").unwrap_or_default(),
                }
            }).collect();

            people_with_contacts.push(PersonWithContacts {
                id: person_id as i32,
                first_name: person_row.try_get("", "first_name").unwrap_or_default(),
                last_name: person_row.try_get("", "last_name").unwrap_or_default(),
                is_primary: person_row.try_get("", "is_primary").unwrap_or(false),
                contacts,
            });
        }

        // Get pet count for this household
        let pet_count_row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            SELECT COUNT(*) as count
            FROM patient_households
            WHERE household_id = ?
            "#,
            [household_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to count pets: {}", e))?
        .ok_or("Failed to count pets")?;

        let pet_count: i64 = pet_count_row.try_get("", "count")
            .map_err(|e| format!("Failed to get pet count: {}", e))?;

        results.push(HouseholdSearchResult {
            id: household_id as i32,
            household_name: household_row.try_get("", "household_name").unwrap_or_default(),
            address: household_row.try_get("", "address").ok(),
            people: people_with_contacts,
            pet_count: pet_count as i32,
            relevance_score: 1.0,
            snippet: None,
        });
    }

    Ok(results)
}

// Rebuild FTS5 index (for maintenance)
pub async fn rebuild_search_index(db: &DatabaseConnection) -> Result<(), String> {
    db.execute_unprepared("DELETE FROM household_search")
        .await
        .map_err(|e| format!("Failed to clear search index: {}", e))?;
    db.execute_unprepared(&index_rows_sql("1 = 1"))
        .await
        .map_err(|e| format!("Failed to rebuild search index: {}", e))?;
    Ok(())
}
