use sqlx::{SqlitePool, Row};
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
    pool: &SqlitePool,
    limit: i32,
    offset: i32,
) -> Result<SearchHouseholdsResponse, sqlx::Error> {
    // Get households directly without FTS5
    let household_rows = sqlx::query(
        r#"
        SELECT
            id,
            household_name,
            address
        FROM households
        ORDER BY household_name, id
        LIMIT ? OFFSET ?
        "#
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    // Get total count
    let total_row = sqlx::query(
        r#"
        SELECT COUNT(*) as count
        FROM households
        "#
    )
    .fetch_one(pool)
    .await?;

    let total: i32 = total_row.get("count");

    let mut results = Vec::new();

    for row in household_rows {
        let household_id: i64 = row.get("id");

        // Get people for this household
        let people_rows = sqlx::query(
            r#"
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.is_primary
            FROM people p
            WHERE p.household_id = ?
            ORDER BY p.is_primary DESC, p.last_name, p.first_name
            "#
        )
        .bind(household_id)
        .fetch_all(pool)
        .await?;

        let mut people_with_contacts = Vec::new();

        for person_row in people_rows {
            let person_id: i64 = person_row.get("id");

            // Get contacts for this person
            let contact_rows = sqlx::query(
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
                "#
            )
            .bind(person_id)
            .fetch_all(pool)
            .await?;

            let contacts: Vec<PersonContact> = contact_rows.into_iter().map(|contact_row| {
                PersonContact {
                    id: contact_row.get::<i32, _>("id"),
                    person_id: contact_row.get::<i32, _>("person_id"),
                    contact_type: contact_row.get("contact_type"),
                    contact_value: contact_row.get("contact_value"),
                    is_primary: contact_row.get::<bool, _>("is_primary"),
                    created_at: contact_row.get("created_at"),
                }
            }).collect();

            people_with_contacts.push(PersonWithContacts {
                id: person_id as i32,
                first_name: person_row.get("first_name"),
                last_name: person_row.get("last_name"),
                is_primary: person_row.get::<bool, _>("is_primary"),
                contacts,
            });
        }

        // Get pet count for this household
        let pet_count_row = sqlx::query(
            r#"
            SELECT COUNT(*) as count
            FROM patient_households
            WHERE household_id = ?
            "#
        )
        .bind(household_id)
        .fetch_one(pool)
        .await?;

        let pet_count: i64 = pet_count_row.get("count");

        results.push(HouseholdSearchResult {
            id: household_id as i32,
            household_name: row.get("household_name"),
            address: row.get("address"),
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
    pool: &SqlitePool,
    query: &str,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<SearchHouseholdsResponse, sqlx::Error> {
    let limit = limit.unwrap_or(10).min(100); // Max 100 results
    let offset = offset.unwrap_or(0);

    // Handle empty or too short queries
    if query.trim().is_empty() || query.trim().len() < 2 {
        // For empty queries, return all households (without FTS5 search)
        return get_all_households_internal(pool, limit, offset).await;
    }

    let fts_query = sanitize_fts5_query(query);

    // Search using FTS5
    let search_results = sqlx::query(
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
        "#
    )
    .bind(&fts_query)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    // Get total count
    let total_row = sqlx::query(
        r#"
        SELECT COUNT(*) as count
        FROM household_search
        WHERE household_search MATCH ?
        "#
    )
    .bind(&fts_query)
    .fetch_one(pool)
    .await?;

    let total: i32 = total_row.get("count");

    let mut results = Vec::new();

    for row in search_results {
        let household_id: i64 = row.get("id");

        // Get people for this household
        let people_rows = sqlx::query(
            r#"
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.is_primary
            FROM people p
            WHERE p.household_id = ?
            ORDER BY p.is_primary DESC, p.last_name, p.first_name
            "#
        )
        .bind(household_id)
        .fetch_all(pool)
        .await?;

        let mut people_with_contacts = Vec::new();

        for person_row in people_rows {
            let person_id: i64 = person_row.get("id");

            // Get contacts for this person
            let contact_rows = sqlx::query(
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
                "#
            )
            .bind(person_id)
            .fetch_all(pool)
            .await?;

            let contacts: Vec<PersonContact> = contact_rows.into_iter().map(|contact_row| {
                PersonContact {
                    id: contact_row.get::<i32, _>("id"),
                    person_id: contact_row.get::<i32, _>("person_id"),
                    contact_type: contact_row.get("contact_type"),
                    contact_value: contact_row.get("contact_value"),
                    is_primary: contact_row.get::<bool, _>("is_primary"),
                    created_at: contact_row.get("created_at"),
                }
            }).collect();

            people_with_contacts.push(PersonWithContacts {
                id: person_id as i32,
                first_name: person_row.get("first_name"),
                last_name: person_row.get("last_name"),
                is_primary: person_row.get::<bool, _>("is_primary"),
                contacts,
            });
        }

        // Get pet count for this household
        let pet_count_row = sqlx::query(
            r#"
            SELECT COUNT(*) as count
            FROM patient_households
            WHERE household_id = ?
            "#
        )
        .bind(household_id)
        .fetch_one(pool)
        .await?;

        let pet_count: i64 = pet_count_row.get("count");

        results.push(HouseholdSearchResult {
            id: household_id as i32,
            household_name: row.get("household_name"),
            address: row.get("address"),
            people: people_with_contacts,
            pet_count: pet_count as i32,
            relevance_score: row.get::<f64, _>("relevance_score"),
            snippet: row.get("snippet"),
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
    pool: &SqlitePool,
    query: &str,
    limit: i32,
) -> Result<Vec<(i32, String)>, sqlx::Error> {
    let fts_query = sanitize_fts5_query(query);
    let limit = limit.min(20);

    let results = sqlx::query(
        r#"
        SELECT
            household_id,
            display_name
        FROM household_search
        WHERE household_search MATCH ?
        ORDER BY bm25(household_search)
        LIMIT ?
        "#
    )
    .bind(&fts_query)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(results
        .into_iter()
        .map(|r| {
            let id: i64 = r.get("household_id");
            let name: Option<String> = r.get("display_name");
            (id as i32, name.unwrap_or_default())
        })
        .collect())
}

// Search households by contact value (phone, email)
pub async fn search_households_by_contact(
    pool: &SqlitePool,
    contact_value: &str,
) -> Result<Vec<HouseholdSearchResult>, sqlx::Error> {
    let search_pattern = format!("%{}%", contact_value);

    let household_rows = sqlx::query(
        r#"
        SELECT DISTINCT h.id, h.household_name, h.address
        FROM households h
        JOIN people p ON p.household_id = h.id
        JOIN person_contacts pc ON pc.person_id = p.id
        WHERE pc.contact_value LIKE ?
        LIMIT 10
        "#
    )
    .bind(&search_pattern)
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();

    for household_row in household_rows {
        let household_id: i64 = household_row.get("id");

        // Get all people for this household
        let people_rows = sqlx::query(
            r#"
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.is_primary
            FROM people p
            WHERE p.household_id = ?
            ORDER BY p.is_primary DESC, p.last_name, p.first_name
            "#
        )
        .bind(household_id)
        .fetch_all(pool)
        .await?;

        let mut people_with_contacts = Vec::new();

        for person_row in people_rows {
            let person_id: i64 = person_row.get("id");

            let contact_rows = sqlx::query(
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
                "#
            )
            .bind(person_id)
            .fetch_all(pool)
            .await?;

            let contacts: Vec<PersonContact> = contact_rows.into_iter().map(|contact_row| {
                PersonContact {
                    id: contact_row.get::<i32, _>("id"),
                    person_id: contact_row.get::<i32, _>("person_id"),
                    contact_type: contact_row.get("contact_type"),
                    contact_value: contact_row.get("contact_value"),
                    is_primary: contact_row.get::<bool, _>("is_primary"),
                    created_at: contact_row.get("created_at"),
                }
            }).collect();

            people_with_contacts.push(PersonWithContacts {
                id: person_id as i32,
                first_name: person_row.get("first_name"),
                last_name: person_row.get("last_name"),
                is_primary: person_row.get::<bool, _>("is_primary"),
                contacts,
            });
        }

        // Get pet count for this household
        let pet_count_row = sqlx::query(
            r#"
            SELECT COUNT(*) as count
            FROM patient_households
            WHERE household_id = ?
            "#
        )
        .bind(household_id)
        .fetch_one(pool)
        .await?;

        let pet_count: i64 = pet_count_row.get("count");

        results.push(HouseholdSearchResult {
            id: household_id as i32,
            household_name: household_row.get("household_name"),
            address: household_row.get("address"),
            people: people_with_contacts,
            pet_count: pet_count as i32,
            relevance_score: 1.0,
            snippet: None,
        });
    }

    Ok(results)
}

// Rebuild FTS5 index (for maintenance)
pub async fn rebuild_search_index(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Clear existing index
    sqlx::query("DELETE FROM household_search")
        .execute(pool)
        .await?;

    // Rebuild from households
    let household_rows = sqlx::query(
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
        "#
    )
    .fetch_all(pool)
    .await?;

    for household_row in household_rows {
        let id: i64 = household_row.get("id");
        let household_name: Option<String> = household_row.get("household_name");
        let address: Option<String> = household_row.get("address");
        let people_names: Option<String> = household_row.get("people_names");
        let contact_values: Option<String> = household_row.get("contact_values");

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

        sqlx::query(
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
            "#
        )
        .bind(id)
        .bind(&household_name)
        .bind(&address)
        .bind(&people_names)
        .bind(&contact_values)
        .bind(&display_name)
        .execute(pool)
        .await?;
    }

    Ok(())
}