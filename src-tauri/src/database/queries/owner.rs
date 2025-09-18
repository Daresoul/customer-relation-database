use sqlx::SqlitePool;
use crate::models::{Owner, CreateOwnerDto, UpdateOwnerDto, OwnerWithPatients, Patient};

pub async fn get_all_owners(pool: &SqlitePool) -> Result<Vec<Owner>, sqlx::Error> {
    sqlx::query_as::<_, Owner>(
        "SELECT id, first_name, last_name, email, phone, address, created_at, updated_at
         FROM owners
         ORDER BY last_name, first_name"
    )
    .fetch_all(pool)
    .await
}

pub async fn get_owner_by_id(pool: &SqlitePool, id: i64) -> Result<Option<Owner>, sqlx::Error> {
    sqlx::query_as::<_, Owner>(
        "SELECT id, first_name, last_name, email, phone, address, created_at, updated_at
         FROM owners
         WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn get_owner_with_patients(pool: &SqlitePool, id: i64) -> Result<Option<OwnerWithPatients>, sqlx::Error> {
    let owner = match get_owner_by_id(pool, id).await? {
        Some(o) => o,
        None => return Ok(None),
    };

    let patients = sqlx::query_as::<_, Patient>(
        "SELECT p.id, p.name, p.species, p.breed, p.date_of_birth, p.weight, p.medical_notes, p.created_at, p.updated_at
         FROM patients p
         INNER JOIN patient_owners po ON p.id = po.patient_id
         WHERE po.owner_id = ?
         ORDER BY p.name"
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(Some(OwnerWithPatients {
        owner,
        patients,
    }))
}

pub async fn create_owner(pool: &SqlitePool, dto: CreateOwnerDto) -> Result<Owner, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO owners (first_name, last_name, email, phone, address)
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&dto.first_name)
    .bind(&dto.last_name)
    .bind(&dto.email)
    .bind(&dto.phone)
    .bind(&dto.address)
    .execute(pool)
    .await?;

    let id = result.last_insert_rowid();
    get_owner_by_id(pool, id).await.map(|o| o.unwrap())
}

pub async fn update_owner(pool: &SqlitePool, id: i64, dto: UpdateOwnerDto) -> Result<Option<Owner>, sqlx::Error> {
    // Build dynamic query based on which fields are being updated
    let mut updates = Vec::new();
    let mut has_updates = false;

    if dto.first_name.is_some() {
        updates.push("first_name = ?");
        has_updates = true;
    }
    if dto.last_name.is_some() {
        updates.push("last_name = ?");
        has_updates = true;
    }
    if dto.email.is_some() {
        updates.push("email = ?");
        has_updates = true;
    }
    if dto.phone.is_some() {
        updates.push("phone = ?");
        has_updates = true;
    }
    if dto.address.is_some() {
        updates.push("address = ?");
        has_updates = true;
    }

    if !has_updates {
        return get_owner_by_id(pool, id).await;
    }

    let query_str = format!(
        "UPDATE owners SET {} WHERE id = ?",
        updates.join(", ")
    );

    let mut query = sqlx::query(&query_str);

    if let Some(first_name) = dto.first_name {
        query = query.bind(first_name);
    }
    if let Some(last_name) = dto.last_name {
        query = query.bind(last_name);
    }
    if let Some(email) = dto.email {
        query = query.bind(email);
    }
    if let Some(phone) = dto.phone {
        query = query.bind(phone);
    }
    if let Some(address) = dto.address {
        query = query.bind(address);
    }

    query = query.bind(id);

    let result = query.execute(pool).await?;

    if result.rows_affected() > 0 {
        get_owner_by_id(pool, id).await
    } else {
        Ok(None)
    }
}

pub async fn delete_owner(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM owners WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn find_owners_by_name(pool: &SqlitePool, search_term: &str) -> Result<Vec<Owner>, sqlx::Error> {
    let search_pattern = format!("%{}%", search_term);

    sqlx::query_as::<_, Owner>(
        "SELECT id, first_name, last_name, email, phone, address, created_at, updated_at
         FROM owners
         WHERE first_name LIKE ? OR last_name LIKE ?
         ORDER BY last_name, first_name"
    )
    .bind(&search_pattern)
    .bind(&search_pattern)
    .fetch_all(pool)
    .await
}