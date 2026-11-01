//! Every raw SQL string literal in `src/` must prepare against the fully
//! migrated schema. Catches "no such table / no such column" bugs that the
//! code would otherwise hide behind `.ok()` / `unwrap_or_default()`.
//!
//! Scope: plain string literals that start with SELECT / INSERT / UPDATE /
//! DELETE / WITH. Skipped: `database/migrations.rs` (each migration runs
//! against an older schema), test code, `format!` templates (contain `{`) and
//! multi-statement batches.
//!
//! Not caught: a column read with `try_get` that the SELECT doesn't return.

use crate::test_utils::create_test_db_with_migrations;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

/// Known-broken SQL that is allowed to fail: (path suffix, error substring).
/// Keep this empty; an entry needs a reason next to it.
const ALLOW: &[(&str, &str)] = &[];

/// Minimal Rust string-literal lexer: yields (line, value) for "..." and r#"..."#.
fn string_literals(src: &str) -> Vec<(usize, String)> {
    let b = src.as_bytes();
    let (mut i, mut line, mut out) = (0usize, 1usize, Vec::new());
    while i < b.len() {
        let c = b[i];
        if c == b'\n' {
            line += 1;
            i += 1;
            continue;
        }
        if c == b'/' && b.get(i + 1) == Some(&b'/') {
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if c == b'\'' {
            // char literal ('x', '\n', '"'); lifetimes fall through harmlessly
            if b.get(i + 2) == Some(&b'\'') {
                i += 3;
                continue;
            }
            if b.get(i + 1) == Some(&b'\\') && b.get(i + 3) == Some(&b'\'') {
                i += 4;
                continue;
            }
            i += 1;
            continue;
        }
        let prev_ident = i > 0 && (b[i - 1].is_ascii_alphanumeric() || b[i - 1] == b'_');
        if c == b'r' && !prev_ident && (b.get(i + 1) == Some(&b'"') || b.get(i + 1) == Some(&b'#')) {
            let mut j = i + 1;
            let mut hashes = 0;
            while b.get(j) == Some(&b'#') {
                hashes += 1;
                j += 1;
            }
            if b.get(j) == Some(&b'"') {
                let start = j + 1;
                let close = format!("\"{}", "#".repeat(hashes));
                if let Some(end) = src[start..].find(&close) {
                    let val = &src[start..start + end];
                    out.push((line, val.to_string()));
                    line += val.matches('\n').count();
                    i = start + end + close.len();
                    continue;
                }
            }
        }
        if c == b'"' {
            let start_line = line;
            let mut j = i + 1;
            let mut val = String::new();
            while j < b.len() && b[j] != b'"' {
                if b[j] == b'\\' {
                    match b.get(j + 1) {
                        Some(b'\n') => {
                            line += 1;
                            j += 2;
                            while j < b.len() && matches!(b[j], b' ' | b'\t' | b'\n' | b'\r') {
                                if b[j] == b'\n' {
                                    line += 1;
                                }
                                j += 1;
                            }
                            continue;
                        }
                        Some(b'n') => val.push('\n'),
                        Some(b't') => val.push('\t'),
                        Some(&x) => val.push(x as char),
                        None => {}
                    }
                    j += 2;
                    continue;
                }
                if b[j] == b'\n' {
                    line += 1;
                }
                let n = match b[j] {
                    0x00..=0x7F => 1,
                    0xC0..=0xDF => 2,
                    0xE0..=0xEF => 3,
                    _ => 4,
                };
                val.push_str(&src[j..j + n]);
                j += n;
            }
            out.push((start_line, val));
            i = j + 1;
            continue;
        }
        i += 1;
    }
    out
}

fn rs_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).unwrap().flatten() {
        let p = e.path();
        if p.is_dir() {
            rs_files(&p, out)
        } else if p.extension().map_or(false, |x| x == "rs") {
            out.push(p)
        }
    }
}

fn looks_like_sql(s: &str) -> bool {
    // Upper-case keywords only (skips prose like "Update preferences not found").
    // A literal ending in SET / WHERE is a builder prefix, not a statement.
    let t = s.trim_start();
    let up = t.trim_end().to_ascii_uppercase();
    ["SELECT ", "SELECT\n", "INSERT ", "UPDATE ", "DELETE ", "WITH "]
        .iter()
        .any(|k| t.starts_with(k))
        && !up.ends_with(" SET")
        && !up.ends_with(" WHERE")
}

/// Prepares every SQL literal of one source file. Returns (checked, failures).
async fn check_source(pool: &SqlitePool, rel: &str, src: &str) -> (usize, Vec<String>) {
    // A Windows checkout has CRLF line ends.
    let cut = src
        .find("#[cfg(test)]\nmod ")
        .or_else(|| src.find("#[cfg(test)]\r\nmod "))
        .unwrap_or(src.len());
    let (mut checked, mut failures) = (0, Vec::new());
    for (line, sql) in string_literals(&src[..cut]) {
        if !looks_like_sql(&sql) || sql.contains('{') {
            continue;
        }
        let body = sql.trim().trim_end_matches(';');
        if body.contains(';') {
            continue;
        }
        checked += 1;
        if let Err(e) = sqlx::Executor::prepare(pool, body).await {
            let msg = e.to_string();
            if ALLOW.iter().any(|(p, m)| rel.ends_with(p) && msg.contains(m)) {
                continue;
            }
            failures.push(format!("{rel}:{line}: {msg}"));
        }
    }
    (checked, failures)
}

#[tokio::test]
async fn every_raw_sql_literal_prepares_against_migrated_schema() {
    let db = create_test_db_with_migrations().await;
    let pool = db.get_sqlite_connection_pool();
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rs_files(&root, &mut files);

    let (mut failures, mut checked) = (Vec::new(), 0);
    for f in files {
        let rel = f.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/");
        if rel.starts_with("tests/") || rel == "test_utils.rs" || rel == "database/migrations.rs" {
            continue;
        }
        let src = std::fs::read_to_string(&f).unwrap();
        let (n, mut fails) = check_source(pool, &rel, &src).await;
        checked += n;
        failures.append(&mut fails);
    }
    assert!(checked > 200, "lexer found only {checked} SQL literals - extractor broken?");
    assert!(
        failures.is_empty(),
        "{} SQL literal(s) don't match the schema:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

#[tokio::test]
async fn checker_flags_unknown_tables_and_columns() {
    let db = create_test_db_with_migrations().await;
    let pool = db.get_sqlite_connection_pool();
    let src = r##"
        fn a() { q("SELECT id FROM no_such_table WHERE id = ?"); }
        fn b() { q(r#"SELECT no_such_column FROM patients"#); }
        fn c() { q("SELECT id, name FROM patients \
                    WHERE id = ?"); }
    "##;
    let (checked, failures) = check_source(pool, "services/example.rs", src).await;
    assert_eq!(checked, 3);
    assert_eq!(failures.len(), 2, "{failures:?}");
    assert!(failures[0].contains("no_such_table"));
    assert!(failures[1].contains("no_such_column"));
}
