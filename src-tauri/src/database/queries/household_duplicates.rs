//! Likely duplicates of a household about to be created, by phone, email
//! and person name. Names compare in Latin form, so "Марко Петровски" and
//! "Marko Petrovski" are the same person. Merged-away households never match.

use super::household_search::sanitize_fts5_query;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, Value};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const MAX_MATCHES: usize = 5;
const MIN_PHONE_DIGITS: usize = 6;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DuplicateCheck {
    pub household_name: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phones: Vec<String>,
    pub emails: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateMatch {
    pub household_id: i32,
    pub household_name: Option<String>,
    pub primary_person: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub pet_count: i64,
    /// "phone", "email" and/or "name"
    pub reasons: Vec<String>,
}

fn cyrillic_to_latin(c: char) -> Option<&'static str> {
    Some(match c {
        'а' => "a", 'б' => "b", 'в' => "v", 'г' => "g", 'д' => "d", 'ѓ' | 'ǵ' => "gj",
        'е' | 'ё' | 'э' => "e", 'ж' | 'ž' => "zh", 'з' => "z", 'ѕ' => "dz", 'и' => "i",
        'ј' | 'й' => "j", 'к' => "k", 'л' => "l", 'љ' => "lj", 'м' => "m", 'н' => "n",
        'њ' => "nj", 'о' => "o", 'п' => "p", 'р' => "r", 'с' => "s", 'т' => "t",
        'ќ' | 'ћ' | 'ć' | 'ḱ' => "kj", 'у' => "u", 'ф' => "f", 'х' => "h", 'ц' => "c",
        'ч' | 'č' => "ch", 'џ' => "dzh", 'ш' | 'š' => "sh", 'ђ' | 'đ' => "dj",
        'ы' => "y", 'ю' => "ju", 'я' => "ja", 'щ' => "sht",
        _ => return None,
    })
}

/// Lower-case Latin text, Macedonian Cyrillic transliterated, other
/// characters kept.
fn latin_text(text: &str) -> String {
    let mut out = String::new();
    for c in text.to_lowercase().chars() {
        match cyrillic_to_latin(c) {
            Some(latin) => out.push_str(latin),
            None => out.push(c),
        }
    }
    out
}

/// Macedonian Cyrillic spelling of Latin text, longest letter groups first
/// ("dzh" → џ, "zh" → ж). Used only to find candidates in the search index.
fn cyrillic_text(latin: &str) -> String {
    const GROUPS: &[(&str, &str)] = &[
        ("dzh", "џ"), ("dz", "ѕ"), ("gj", "ѓ"), ("kj", "ќ"), ("lj", "љ"), ("nj", "њ"),
        ("zh", "ж"), ("ch", "ч"), ("sh", "ш"),
        ("a", "а"), ("b", "б"), ("v", "в"), ("g", "г"), ("d", "д"), ("e", "е"), ("z", "з"),
        ("i", "и"), ("j", "ј"), ("k", "к"), ("l", "л"), ("m", "м"), ("n", "н"), ("o", "о"),
        ("p", "п"), ("r", "р"), ("s", "с"), ("t", "т"), ("u", "у"), ("f", "ф"), ("h", "х"),
        ("c", "ц"),
    ];
    let mut out = String::new();
    let mut rest = latin;
    'outer: while let Some(c) = rest.chars().next() {
        for (from, to) in GROUPS {
            if rest.starts_with(from) {
                out.push_str(to);
                rest = &rest[from.len()..];
                continue 'outer;
            }
        }
        out.push(c);
        rest = &rest[c.len_utf8()..];
    }
    out
}

/// Lower-case Latin form of a name, so "Марко" and "Marko" compare equal.
/// Spaces and punctuation drop out.
pub fn latinize(text: &str) -> String {
    latin_text(text).chars().filter(|c| c.is_ascii_alphanumeric()).collect()
}

/// Digits of a phone number with a Macedonian country prefix turned into
/// the local 0, so "+389 70 123 456" and "070-123-456" compare equal.
pub fn normalize_phone(value: &str) -> String {
    let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
    let digits = digits.strip_prefix("00").unwrap_or(&digits).to_string();
    match digits.strip_prefix("389") {
        Some(rest) if !rest.is_empty() => format!("0{}", rest.trim_start_matches('0')),
        _ => digits,
    }
}

pub fn is_phone_type(contact_type: &str) -> bool {
    matches!(contact_type, "phone" | "mobile" | "work_phone")
}

/// FTS query for a name typed in either script: as typed, in Latin and in
/// Cyrillic.
fn name_query(name: &str) -> String {
    let latin = latin_text(name);
    [name.to_string(), latin.clone(), cyrillic_text(&latin)]
        .iter()
        .map(|v| sanitize_fts5_query(v))
        .filter(|q| !q.is_empty())
        .collect::<Vec<_>>()
        .join(" OR ")
}

fn stmt(sql: &str, values: Vec<Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}

async fn rows(db: &DatabaseConnection, sql: &str, values: Vec<Value>) -> Result<Vec<sea_orm::QueryResult>, String> {
    db.query_all(stmt(sql, values))
        .await
        .map_err(|e| format!("Duplicate check failed: {e}"))
}

fn text(row: &sea_orm::QueryResult, col: &str) -> String {
    row.try_get::<Option<String>>("", col).unwrap_or(None).unwrap_or_default()
}

fn present(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// Households that look like the one being created, best match first.
pub async fn find_household_duplicates(
    db: &DatabaseConnection,
    check: &DuplicateCheck,
) -> Result<Vec<DuplicateMatch>, String> {
    let mut reasons: BTreeMap<i32, Vec<&'static str>> = BTreeMap::new();
    let mut add = |household_id: i32, reason: &'static str| {
        let list = reasons.entry(household_id).or_default();
        if !list.contains(&reason) {
            list.push(reason);
        }
    };

    for typed in &check.phones {
        let wanted = normalize_phone(typed);
        if wanted.len() < MIN_PHONE_DIGITS {
            continue;
        }
        let tail = format!("%{}", &wanted[wanted.len() - MIN_PHONE_DIGITS..]);
        for row in rows(db,
            "SELECT p.household_id, pc.contact_value FROM person_contacts pc \
             JOIN people p ON p.id = pc.person_id JOIN households h ON h.id = p.household_id \
             WHERE h.merged_into_id IS NULL AND pc.contact_type IN ('phone', 'mobile', 'work_phone') \
             AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(pc.contact_value, ' ', ''), '-', ''), '/', ''), '(', ''), ')', ''), '.', '') LIKE ?",
            vec![tail.into()]).await?
        {
            if normalize_phone(&text(&row, "contact_value")) == wanted {
                add(row.try_get("", "household_id").unwrap_or(0), "phone");
            }
        }
    }

    for typed in &check.emails {
        let wanted = typed.trim().to_lowercase();
        if !wanted.contains('@') {
            continue;
        }
        for row in rows(db,
            "SELECT p.household_id FROM person_contacts pc \
             JOIN people p ON p.id = pc.person_id JOIN households h ON h.id = p.household_id \
             WHERE h.merged_into_id IS NULL AND pc.contact_type = 'email' AND LOWER(TRIM(pc.contact_value)) = ?",
            vec![wanted.into()]).await?
        {
            add(row.try_get("", "household_id").unwrap_or(0), "email");
        }
    }

    match (present(&check.first_name), present(&check.last_name), present(&check.household_name)) {
        (Some(first), Some(last), _) => {
            let wanted = (latinize(first), latinize(last));
            let query = name_query(last);
            if !query.is_empty() {
                for row in rows(db,
                    "SELECT p.household_id, p.first_name, p.last_name FROM people p \
                     JOIN households h ON h.id = p.household_id WHERE h.merged_into_id IS NULL \
                     AND p.household_id IN (SELECT household_id FROM household_search WHERE household_search MATCH ?)",
                    vec![query.into()]).await?
                {
                    if (latinize(&text(&row, "first_name")), latinize(&text(&row, "last_name"))) == wanted {
                        add(row.try_get("", "household_id").unwrap_or(0), "name");
                    }
                }
            }
        }
        (None, None, Some(name)) => {
            let wanted = latinize(name);
            let query = name_query(name);
            if !query.is_empty() && !wanted.is_empty() {
                for row in rows(db,
                    "SELECT id, household_name FROM households WHERE merged_into_id IS NULL \
                     AND id IN (SELECT household_id FROM household_search WHERE household_search MATCH ?)",
                    vec![query.into()]).await?
                {
                    if latinize(&text(&row, "household_name")) == wanted {
                        add(row.try_get("", "id").unwrap_or(0), "name");
                    }
                }
            }
        }
        _ => {}
    }

    let rank = |r: &&'static str| match *r { "phone" => 0, "email" => 1, _ => 2 };
    let mut ranked: Vec<(i32, Vec<&'static str>)> = reasons.into_iter().collect();
    for (_, list) in ranked.iter_mut() {
        list.sort_by_key(rank);
    }
    ranked.sort_by_key(|(id, list)| (std::cmp::Reverse(list.len()), list.first().map(rank), *id));
    ranked.truncate(MAX_MATCHES);

    let mut out = Vec::new();
    for (household_id, list) in ranked {
        let Some(h) = rows(db,
            "SELECT household_name, address, city, \
             (SELECT COUNT(*) FROM patient_households ph WHERE ph.household_id = households.id) AS pet_count \
             FROM households WHERE id = ?",
            vec![household_id.into()]).await?.into_iter().next() else { continue };
        let person = rows(db,
            "SELECT id, first_name, last_name FROM people WHERE household_id = ? ORDER BY is_primary DESC, id LIMIT 1",
            vec![household_id.into()]).await?.into_iter().next();
        let phone = match &person {
            Some(p) => rows(db,
                "SELECT contact_value FROM person_contacts WHERE person_id = ? \
                 AND contact_type IN ('phone', 'mobile', 'work_phone') ORDER BY is_primary DESC, id LIMIT 1",
                vec![p.try_get::<i32>("", "id").unwrap_or(0).into()]).await?
                .first()
                .map(|r| text(r, "contact_value")),
            None => None,
        };
        let opt = |col: &str| Some(text(&h, col)).filter(|s| !s.is_empty());
        out.push(DuplicateMatch {
            household_id,
            household_name: opt("household_name"),
            primary_person: person.map(|p| format!("{} {}", text(&p, "first_name"), text(&p, "last_name")).trim().to_string()),
            phone,
            address: opt("address"),
            city: opt("city"),
            pet_count: h.try_get("", "pet_count").unwrap_or(0),
            reasons: list.into_iter().map(String::from).collect(),
        });
    }
    Ok(out)
}
