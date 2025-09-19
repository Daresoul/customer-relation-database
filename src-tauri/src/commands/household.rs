use serde::{Deserialize, Serialize};
use tauri::State;
use crate::database::connection::DatabasePool;
use crate::database::queries::owner as owner_queries;
use crate::models::{Owner, CreateOwnerDto};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseholdContact {
    #[serde(rename = "type")]
    pub contact_type: String,
    pub value: String,
    #[serde(rename = "isPrimary")]
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseholdSearchResult {
    pub id: i64,
    #[serde(rename = "householdName")]
    pub household_name: String,
    pub address: Option<String>,
    pub city: Option<String>,
    #[serde(rename = "postalCode")]
    pub postal_code: Option<String>,
    pub contacts: Vec<HouseholdContact>,
    #[serde(rename = "petCount")]
    pub pet_count: i64,
    #[serde(rename = "relevanceScore")]
    pub relevance_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHouseholdsCommand {
    pub query: String,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    #[serde(rename = "sortBy")]
    pub sort_by: Option<String>,
    #[serde(rename = "sortDirection")]
    pub sort_direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHouseholdsResponse {
    pub results: Vec<HouseholdSearchResult>,
    pub total: i64,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
    pub query: String,
    pub offset: i32,
    pub limit: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateHouseholdCommand {
    #[serde(rename = "householdName")]
    pub household_name: String,
    pub address: Option<String>,
    pub city: Option<String>,
    #[serde(rename = "postalCode")]
    pub postal_code: Option<String>,
    pub contacts: Vec<HouseholdContact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetHouseholdResponse {
    pub id: i64,
    #[serde(rename = "householdName")]
    pub household_name: String,
    pub address: Option<String>,
    pub city: Option<String>,
    #[serde(rename = "postalCode")]
    pub postal_code: Option<String>,
    pub contacts: Vec<HouseholdContact>,
    #[serde(rename = "petCount")]
    pub pet_count: i64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

// Helper function to convert Owner to HouseholdSearchResult
fn owner_to_household_result(owner: &Owner, pet_count: i64) -> HouseholdSearchResult {
    let mut contacts = Vec::new();

    // Add primary phone contact if available
    if let Some(phone) = &owner.phone {
        contacts.push(HouseholdContact {
            contact_type: "phone".to_string(),
            value: phone.clone(),
            is_primary: true,
        });
    }

    // Add email contact if available
    if let Some(email) = &owner.email {
        contacts.push(HouseholdContact {
            contact_type: "email".to_string(),
            value: email.clone(),
            is_primary: contacts.is_empty(), // Primary if no phone
        });
    }

    // Parse address for city and postal code
    let (city, postal_code) = if let Some(address) = &owner.address {
        // Simple parsing - split by comma and try to extract city/postal
        let parts: Vec<&str> = address.split(',').map(|s| s.trim()).collect();
        let city = if parts.len() > 1 {
            Some(parts[parts.len() - 2].to_string())
        } else {
            None
        };
        let postal_code = if parts.len() > 0 {
            // Look for postal code pattern in last part
            let last_part = parts[parts.len() - 1];
            if last_part.chars().any(|c| c.is_numeric()) {
                Some(last_part.to_string())
            } else {
                None
            }
        } else {
            None
        };
        (city, postal_code)
    } else {
        (None, None)
    };

    HouseholdSearchResult {
        id: owner.id,
        household_name: format!("{} {}", owner.first_name, owner.last_name),
        address: owner.address.clone(),
        city,
        postal_code,
        contacts,
        pet_count,
        relevance_score: Some(1.0), // Simple relevance score
    }
}

// Helper function to get pet count for an owner
async fn get_pet_count_for_owner(pool: &sqlx::SqlitePool, owner_id: i64) -> Result<i64, sqlx::Error> {
    let result = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM patient_owners WHERE owner_id = ?"
    )
    .bind(owner_id)
    .fetch_one(pool)
    .await?;

    Ok(result)
}

#[tauri::command]
pub async fn search_households(
    pool: State<'_, DatabasePool>,
    command: SearchHouseholdsCommand,
) -> Result<SearchHouseholdsResponse, String> {
    // Validate query length
    if command.query.len() < 2 {
        return Err("Query must be at least 2 characters".to_string());
    }

    // Validate limits
    let limit = command.limit.unwrap_or(10);
    let offset = command.offset.unwrap_or(0);

    if limit > 100 {
        return Err("Limit cannot exceed 100".to_string());
    }

    let pool = pool.lock().await;

    // Search owners using existing infrastructure
    let owners = crate::database::queries::search::search_owners(&*pool, &command.query)
        .await
        .map_err(|e| e.to_string())?;

    // Convert to household results with pet counts
    let mut household_results = Vec::new();
    for owner in &owners {
        let pet_count = get_pet_count_for_owner(&*pool, owner.id)
            .await
            .unwrap_or(0);
        let household = owner_to_household_result(owner, pet_count);
        household_results.push(household);
    }

    // Apply sorting if specified
    if let Some(sort_by) = &command.sort_by {
        match sort_by.as_str() {
            "pet_count" => {
                let desc = command.sort_direction.as_deref() == Some("desc");
                household_results.sort_by(|a, b| {
                    if desc {
                        b.pet_count.cmp(&a.pet_count)
                    } else {
                        a.pet_count.cmp(&b.pet_count)
                    }
                });
            }
            "household_name" => {
                let desc = command.sort_direction.as_deref() == Some("desc");
                household_results.sort_by(|a, b| {
                    if desc {
                        b.household_name.cmp(&a.household_name)
                    } else {
                        a.household_name.cmp(&b.household_name)
                    }
                });
            }
            _ => {} // Default order from database
        }
    }

    let total = household_results.len() as i64;

    // Apply pagination
    let start = offset as usize;
    let end = std::cmp::min(start + limit as usize, household_results.len());
    let paginated_results = if start < household_results.len() {
        household_results[start..end].to_vec()
    } else {
        Vec::new()
    };

    let has_more = end < household_results.len();

    Ok(SearchHouseholdsResponse {
        results: paginated_results,
        total,
        has_more,
        query: command.query,
        offset,
        limit,
    })
}

#[tauri::command]
pub async fn create_household(
    pool: State<'_, DatabasePool>,
    command: CreateHouseholdCommand,
) -> Result<GetHouseholdResponse, String> {
    let pool = pool.lock().await;

    // Parse household name into first and last name
    let name_parts: Vec<&str> = command.household_name.split_whitespace().collect();
    let (first_name, last_name) = if name_parts.len() >= 2 {
        (name_parts[0].to_string(), name_parts[1..].join(" "))
    } else {
        (command.household_name.clone(), "".to_string())
    };

    // Extract primary phone and email from contacts
    let primary_phone = command.contacts.iter()
        .find(|c| c.contact_type == "phone" && c.is_primary)
        .or_else(|| command.contacts.iter().find(|c| c.contact_type == "phone"))
        .map(|c| c.value.clone());

    let primary_email = command.contacts.iter()
        .find(|c| c.contact_type == "email" && c.is_primary)
        .or_else(|| command.contacts.iter().find(|c| c.contact_type == "email"))
        .map(|c| c.value.clone());

    // Create owner DTO
    let owner_dto = CreateOwnerDto {
        first_name,
        last_name,
        email: primary_email,
        phone: primary_phone,
        address: command.address,
    };

    // Create owner using existing infrastructure
    let owner = owner_queries::create_owner(&*pool, owner_dto)
        .await
        .map_err(|e| e.to_string())?;

    // Return household response
    Ok(GetHouseholdResponse {
        id: owner.id,
        household_name: command.household_name,
        address: owner.address,
        city: command.city,
        postal_code: command.postal_code,
        contacts: command.contacts,
        pet_count: 0,
        created_at: owner.created_at.to_rfc3339(),
        updated_at: owner.updated_at.to_rfc3339(),
    })
}

#[tauri::command]
pub async fn get_household(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<Option<GetHouseholdResponse>, String> {
    let pool = pool.lock().await;

    // Get owner using existing infrastructure
    let owner = owner_queries::get_owner_by_id(&*pool, id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(owner) = owner {
        let pet_count = get_pet_count_for_owner(&*pool, owner.id)
            .await
            .unwrap_or(0);

        // Convert owner to household format
        let mut contacts = Vec::new();

        if let Some(phone) = &owner.phone {
            contacts.push(HouseholdContact {
                contact_type: "phone".to_string(),
                value: phone.clone(),
                is_primary: true,
            });
        }

        if let Some(email) = &owner.email {
            contacts.push(HouseholdContact {
                contact_type: "email".to_string(),
                value: email.clone(),
                is_primary: contacts.is_empty(),
            });
        }

        // Parse address for city and postal code
        let (city, postal_code) = if let Some(address) = &owner.address {
            let parts: Vec<&str> = address.split(',').map(|s| s.trim()).collect();
            let city = if parts.len() > 1 {
                Some(parts[parts.len() - 2].to_string())
            } else {
                None
            };
            let postal_code = if parts.len() > 0 {
                let last_part = parts[parts.len() - 1];
                if last_part.chars().any(|c| c.is_numeric()) {
                    Some(last_part.to_string())
                } else {
                    None
                }
            } else {
                None
            };
            (city, postal_code)
        } else {
            (None, None)
        };

        Ok(Some(GetHouseholdResponse {
            id: owner.id,
            household_name: format!("{} {}", owner.first_name, owner.last_name),
            address: owner.address,
            city,
            postal_code,
            contacts,
            pet_count,
            created_at: owner.created_at.to_rfc3339(),
            updated_at: owner.updated_at.to_rfc3339(),
        }))
    } else {
        Ok(None)
    }
}