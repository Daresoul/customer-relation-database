//! Names typed into master data and people: trimmed, never blank, and
//! compared without case in every script (SQLite NOCASE folds ASCII only).

/// The trimmed name, or an error naming the field when nothing is left.
pub fn required_name(value: &str, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{field} is required"));
    }
    Ok(trimmed.to_string())
}

/// True when `name` equals one of `existing` once both are trimmed and
/// lower-cased.
pub fn name_taken<'a>(existing: impl IntoIterator<Item = &'a str>, name: &str) -> bool {
    let wanted = name.trim().to_lowercase();
    existing.into_iter().any(|e| e.trim().to_lowercase() == wanted)
}
