use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};
use crate::models::household::*;

// Sanitize query for FTS5 to prevent syntax errors
fn sanitize_fts5_query(query: &str) -> String {
    // Remove special FTS5 characters and normalize
    let terms: Vec<String> = query
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '@' || *c == '.')
        .collect::<String>()
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .map(|s| format!("{}*", s)) // Add wildcard for prefix matching
        .collect();

    // Join with OR operator, but only if we have multiple terms
    if terms.is_empty() {
        String::new()
    } else if terms.len() == 1 {
        terms[0].clone()
    } else {
        terms.join(" OR ")
    }
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
    // Clear existing index
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM household_search",
        []
    ))
    .await
    .map_err(|e| format!("Failed to clear search index: {}", e))?;

    // Rebuild from households
    let household_rows = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT
            h.id,
            h.household_name,
            h.address,
            GROUP_CONCAT(DISTINCT p.first_name || ' ' || p.last_name, ' ') as people_names,
            GROUP_CONCAT(DISTINCT pc.contact_value, ' ') as contact_values
        FROM households h
        LEFT JOIN people p ON p.household_id = h.id
        LEFT JOIN person_contacts pc ON pc.person_id = p.id
        GROUP BY h.id
        "#,
        []
    ))
    .await
    .map_err(|e| format!("Failed to fetch households for reindex: {}", e))?;

    for household_row in household_rows {
        let id: i64 = household_row.try_get("", "id")
            .map_err(|e| format!("Failed to get id: {}", e))?;
        let household_name: Option<String> = household_row.try_get("", "household_name").ok();
        let address: Option<String> = household_row.try_get("", "address").ok();
        let people_names: Option<String> = household_row.try_get("", "people_names").ok();
        let contact_values: Option<String> = household_row.try_get("", "contact_values").ok();

        // Generate display name
        let display_name = if let Some(name) = &household_name {
            name.clone()
        } else if let Some(people) = &people_names {
            let names: Vec<&str> = people.split(' ').collect();
            if names.len() == 2 {
                format!("{} & {}", names[0], names[1])
            } else {
                people.clone()
            }
        } else {
            format!("Household {}", id)
        };

        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            INSERT INTO household_search (
                household_id,
                household_name,
                address,
                people_names,
                contact_values,
                display_name
            )
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
            [
                id.into(),
                sea_orm::Value::String(household_name.map(Box::new)),
                sea_orm::Value::String(address.map(Box::new)),
                sea_orm::Value::String(people_names.map(Box::new)),
                sea_orm::Value::String(contact_values.map(Box::new)),
                display_name.into(),
            ]
        ))
        .await
        .map_err(|e| format!("Failed to insert into search index: {}", e))?;
    }

    Ok(())
}
