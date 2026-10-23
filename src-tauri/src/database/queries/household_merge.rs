//! Household lifecycle: merge two households, move a pet, the single primary
//! person, and the guarded delete.

use crate::models::household::*;
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DbBackend, Statement, TransactionTrait, Value,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use super::household_duplicates::{is_phone_type, latinize, normalize_phone};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergePet {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeSide {
    pub household: Household,
    pub people: Vec<PersonWithContacts>,
    pub pets: Vec<MergePet>,
    pub record_count: i64,
    pub appointment_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseholdMergePreview {
    pub keep: MergeSide,
    pub merge: MergeSide,
}

fn stmt(sql: &str, values: Vec<Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}

async fn exec<C: ConnectionTrait>(c: &C, sql: &str, values: Vec<Value>) -> Result<u64, String> {
    c.execute(stmt(sql, values))
        .await
        .map(|r| r.rows_affected())
        .map_err(|e| format!("{sql}: {e}"))
}

async fn count<C: ConnectionTrait>(c: &C, sql: &str, values: Vec<Value>) -> Result<i64, String> {
    c.query_one(stmt(sql, values))
        .await
        .map_err(|e| format!("{sql}: {e}"))?
        .map(|r| r.try_get_by_index::<i64>(0).unwrap_or(0))
        .ok_or_else(|| format!("{sql}: no row"))
}

/// Two contacts with the same key are the same phone number or email.
fn contact_key(contact_type: &str, value: &str) -> (bool, String) {
    if is_phone_type(contact_type) {
        let digits = normalize_phone(value);
        if !digits.is_empty() {
            return (true, digits);
        }
    }
    (false, value.trim().to_lowercase())
}

fn person_key(first: &str, last: &str) -> String {
    format!("{}|{}", latinize(first), latinize(last))
}

async fn resolve<C: ConnectionTrait>(c: &C, household_id: i32) -> Result<Option<i32>, String> {
    let mut current = household_id;
    for _ in 0..32 {
        let row = c
            .query_one(stmt("SELECT merged_into_id FROM households WHERE id = ?", vec![current.into()]))
            .await
            .map_err(|e| format!("Failed to find household: {e}"))?;
        match row {
            None => return Ok(None),
            Some(row) => match row.try_get::<Option<i32>>("", "merged_into_id").unwrap_or(None) {
                None => return Ok(Some(current)),
                Some(next) => current = next,
            },
        }
    }
    Err(format!("Household {household_id} has a merge loop"))
}

/// The household an id stands for today: itself, or the household it was
/// merged into. `None` when no such household exists.
pub async fn resolve_household_id(db: &DatabaseConnection, household_id: i32) -> Result<Option<i32>, String> {
    resolve(db, household_id).await
}

struct HouseholdRow {
    name: Option<String>,
    address: Option<String>,
    city: Option<String>,
    postal_code: Option<String>,
    notes: Option<String>,
}

async fn active_household<C: ConnectionTrait>(c: &C, id: i32) -> Result<HouseholdRow, String> {
    let row = c
        .query_one(stmt(
            "SELECT household_name, address, city, postal_code, notes, merged_into_id FROM households WHERE id = ?",
            vec![id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to load household: {e}"))?
        .ok_or_else(|| format!("Household {id} not found"))?;
    if row.try_get::<Option<i32>>("", "merged_into_id").unwrap_or(None).is_some() {
        return Err(format!("Household {id} was already merged"));
    }
    let text = |col: &str| row.try_get::<Option<String>>("", col).unwrap_or(None);
    Ok(HouseholdRow {
        name: text("household_name"),
        address: text("address"),
        city: text("city"),
        postal_code: text("postal_code"),
        notes: text("notes"),
    })
}

async fn merge_side(db: &DatabaseConnection, id: i32) -> Result<MergeSide, String> {
    active_household(db, id).await?;
    let hwp = super::household::get_household_with_people(db, id)
        .await?
        .ok_or_else(|| format!("Household {id} not found"))?;
    let pets = db
        .query_all(stmt(
            "SELECT p.id, p.name FROM patients p JOIN patient_households ph ON ph.patient_id = p.id \
             WHERE ph.household_id = ? ORDER BY p.name",
            vec![id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to load pets: {e}"))?
        .iter()
        .map(|r| MergePet {
            id: r.try_get("", "id").unwrap_or(0),
            name: r.try_get::<Option<String>>("", "name").unwrap_or(None).unwrap_or_default(),
        })
        .collect();
    let record_count = count(db,
        "SELECT COUNT(*) FROM medical_records mr JOIN patient_households ph ON ph.patient_id = mr.patient_id \
         WHERE ph.household_id = ?", vec![id.into()]).await?;
    let appointment_count = count(db,
        "SELECT COUNT(*) FROM appointments a JOIN patient_households ph ON ph.patient_id = a.patient_id \
         WHERE ph.household_id = ? AND a.deleted_at IS NULL", vec![id.into()]).await?;
    Ok(MergeSide { household: hwp.household, people: hwp.people, pets, record_count, appointment_count })
}

/// Both households side by side, for the confirm step of a merge.
pub async fn merge_preview(db: &DatabaseConnection, keep_id: i32, merge_id: i32) -> Result<HouseholdMergePreview, String> {
    if keep_id == merge_id {
        return Err("Cannot merge a household into itself".into());
    }
    Ok(HouseholdMergePreview { keep: merge_side(db, keep_id).await?, merge: merge_side(db, merge_id).await? })
}

/// Merges `merge_id` into `keep_id` in one transaction. People, contacts and
/// pets move to the kept household; a person with the same name (in either
/// script) folds into the kept person, and a phone or email the kept
/// household already has is dropped. The kept household takes its name and
/// address from `details_from` (one of the two). The merged-away row stays
/// with `merged_into_id` set and the merge is logged in `household_merges`.
pub async fn merge_households(
    db: &DatabaseConnection,
    keep_id: i32,
    merge_id: i32,
    details_from: i32,
) -> Result<(), String> {
    if keep_id == merge_id {
        return Err("Cannot merge a household into itself".into());
    }
    if details_from != keep_id && details_from != merge_id {
        return Err("Name and address must come from one of the two households".into());
    }

    let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {e}"))?;
    let keep = active_household(&txn, keep_id).await?;
    let merged = active_household(&txn, merge_id).await?;

    if details_from == merge_id {
        exec(&txn,
            "UPDATE households SET household_name = ?, address = ?, city = ?, postal_code = ? WHERE id = ?",
            vec![
                merged.name.clone().into(),
                merged.address.clone().into(),
                merged.city.clone().into(),
                merged.postal_code.clone().into(),
                keep_id.into(),
            ]).await?;
    }
    let present = |v: &Option<String>| v.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    if let Some(merged_notes) = present(&merged.notes) {
        let notes = match present(&keep.notes) {
            Some(kept_notes) => format!("{kept_notes}\n{merged_notes}"),
            None => merged_notes,
        };
        exec(&txn, "UPDATE households SET notes = ? WHERE id = ?", vec![notes.into(), keep_id.into()]).await?;
    }

    let mut kept_people: Vec<(i32, String)> = txn
        .query_all(stmt("SELECT id, first_name, last_name FROM people WHERE household_id = ?", vec![keep_id.into()]))
        .await
        .map_err(|e| format!("Failed to load people: {e}"))?
        .iter()
        .map(|r| {
            let first: String = r.try_get("", "first_name").unwrap_or_default();
            let last: String = r.try_get("", "last_name").unwrap_or_default();
            (r.try_get("", "id").unwrap_or(0), person_key(&first, &last))
        })
        .collect();
    let mut known_contacts: HashSet<(bool, String)> = txn
        .query_all(stmt(
            "SELECT pc.contact_type, pc.contact_value FROM person_contacts pc \
             JOIN people p ON p.id = pc.person_id WHERE p.household_id = ?",
            vec![keep_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to load contacts: {e}"))?
        .iter()
        .map(|r| {
            let kind: String = r.try_get("", "contact_type").unwrap_or_default();
            let value: String = r.try_get("", "contact_value").unwrap_or_default();
            contact_key(&kind, &value)
        })
        .collect();

    let merging_people = txn
        .query_all(stmt(
            "SELECT id, first_name, last_name FROM people WHERE household_id = ? ORDER BY id",
            vec![merge_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to load people: {e}"))?;

    let (mut people_moved, mut people_folded, mut contacts_dropped) = (0i64, 0i64, 0i64);
    for row in &merging_people {
        let person_id: i32 = row.try_get("", "id").unwrap_or(0);
        let first: String = row.try_get("", "first_name").unwrap_or_default();
        let last: String = row.try_get("", "last_name").unwrap_or_default();

        let contacts = txn
            .query_all(stmt(
                "SELECT id, contact_type, contact_value FROM person_contacts WHERE person_id = ? ORDER BY id",
                vec![person_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to load contacts: {e}"))?;
        for c in &contacts {
            let kind: String = c.try_get("", "contact_type").unwrap_or_default();
            let value: String = c.try_get("", "contact_value").unwrap_or_default();
            if !known_contacts.insert(contact_key(&kind, &value)) {
                let contact_id: i64 = c.try_get("", "id").unwrap_or(0);
                exec(&txn, "DELETE FROM person_contacts WHERE id = ?", vec![contact_id.into()]).await?;
                contacts_dropped += 1;
            }
        }

        let key = person_key(&first, &last);
        if let Some((kept_id, _)) = kept_people.iter().find(|(_, k)| *k == key) {
            exec(&txn, "UPDATE person_contacts SET person_id = ? WHERE person_id = ?",
                vec![(*kept_id).into(), person_id.into()]).await?;
            exec(&txn, "DELETE FROM people WHERE id = ?", vec![person_id.into()]).await?;
            people_folded += 1;
        } else {
            exec(&txn, "UPDATE people SET household_id = ?, is_primary = 0 WHERE id = ?",
                vec![keep_id.into(), person_id.into()]).await?;
            kept_people.push((person_id, key));
            people_moved += 1;
        }
    }

    let pets_moved = exec(&txn,
        "UPDATE patient_households SET household_id = ? WHERE household_id = ? \
         AND patient_id NOT IN (SELECT patient_id FROM patient_households WHERE household_id = ?)",
        vec![keep_id.into(), merge_id.into(), keep_id.into()]).await?;
    exec(&txn, "DELETE FROM patient_households WHERE household_id = ?", vec![merge_id.into()]).await?;

    if count(&txn, "SELECT COUNT(*) FROM people WHERE household_id = ? AND is_primary = 1", vec![keep_id.into()]).await? == 0 {
        exec(&txn,
            "UPDATE people SET is_primary = 1 WHERE id = (SELECT id FROM people WHERE household_id = ? ORDER BY id LIMIT 1)",
            vec![keep_id.into()]).await?;
    }

    exec(&txn, "UPDATE households SET merged_into_id = ? WHERE id = ? OR merged_into_id = ?",
        vec![keep_id.into(), merge_id.into(), merge_id.into()]).await?;
    exec(&txn, "DELETE FROM household_search WHERE household_id = ?", vec![merge_id.into()]).await?;
    exec(&txn,
        "INSERT INTO household_merges (kept_household_id, merged_household_id, merged_household_name, \
         details_from_household_id, people_moved, people_folded, contacts_dropped, pets_moved) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            keep_id.into(), merge_id.into(), merged.name.clone().into(), details_from.into(),
            people_moved.into(), people_folded.into(), contacts_dropped.into(), (pets_moved as i64).into(),
        ]).await?;

    txn.commit().await.map_err(|e| format!("Failed to commit merge: {e}"))?;
    log::info!(
        "Merged household {merge_id} into {keep_id}: {people_moved} people moved, {people_folded} folded, \
         {contacts_dropped} duplicate contacts dropped, {pets_moved} pets moved"
    );
    Ok(())
}

/// Makes this person the household's only primary contact.
pub async fn set_primary_person(db: &DatabaseConnection, person_id: i32) -> Result<(), String> {
    let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {e}"))?;
    let household_id: i32 = txn
        .query_one(stmt("SELECT household_id FROM people WHERE id = ?", vec![person_id.into()]))
        .await
        .map_err(|e| format!("Failed to find person: {e}"))?
        .ok_or("Person not found")?
        .try_get("", "household_id")
        .map_err(|e| format!("Failed to get household_id: {e}"))?;
    exec(&txn, "UPDATE people SET is_primary = (id = ?) WHERE household_id = ?",
        vec![person_id.into(), household_id.into()]).await?;
    txn.commit().await.map_err(|e| format!("Failed to commit: {e}"))
}

/// Deletes a person (their contacts cascade). The last person can't be
/// deleted; deleting the primary person makes the longest-standing other
/// person primary.
pub async fn delete_person(db: &DatabaseConnection, person_id: i32) -> Result<(), String> {
    let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {e}"))?;
    let row = txn
        .query_one(stmt("SELECT household_id, is_primary FROM people WHERE id = ?", vec![person_id.into()]))
        .await
        .map_err(|e| format!("Failed to find person: {e}"))?
        .ok_or("Person not found")?;
    let household_id: i32 = row.try_get("", "household_id").map_err(|e| format!("Failed to get household_id: {e}"))?;
    let was_primary: bool = row.try_get::<Option<bool>>("", "is_primary").unwrap_or(None).unwrap_or(false);

    if count(&txn, "SELECT COUNT(*) FROM people WHERE household_id = ?", vec![household_id.into()]).await? <= 1 {
        return Err("Cannot delete the last person in a household".to_string());
    }
    exec(&txn, "DELETE FROM people WHERE id = ?", vec![person_id.into()]).await?;
    if was_primary {
        exec(&txn,
            "UPDATE people SET is_primary = 1 WHERE id = (SELECT id FROM people WHERE household_id = ? ORDER BY id LIMIT 1)",
            vec![household_id.into()]).await?;
    }
    txn.commit().await.map_err(|e| format!("Failed to commit: {e}"))
}

/// Moves a pet to another household (or unlinks it with `None`). A pet has
/// one household; a merged-away household id lands in the kept household.
pub async fn set_patient_household(
    db: &DatabaseConnection,
    patient_id: i64,
    household_id: Option<i32>,
) -> Result<(), String> {
    let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {e}"))?;
    if count(&txn, "SELECT COUNT(*) FROM patients WHERE id = ?", vec![patient_id.into()]).await? == 0 {
        return Err(format!("Patient {patient_id} not found"));
    }
    let target = match household_id {
        Some(id) => Some(resolve(&txn, id).await?.ok_or_else(|| format!("Household {id} not found"))?),
        None => None,
    };
    exec(&txn, "DELETE FROM patient_households WHERE patient_id = ?", vec![patient_id.into()]).await?;
    if let Some(target) = target {
        exec(&txn,
            "INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary) VALUES (?, ?, 'Pet', 1)",
            vec![patient_id.into(), target.into()]).await?;
    }
    txn.commit().await.map_err(|e| format!("Failed to commit: {e}"))
}
