//! Record templates (Settings › Record templates) and "Copy from last record".
//!
//! A template holds the record type, title, description, prescription,
//! price-list lines with a quantity, and diagnoses. A line keeps only the
//! price-list item and quantity; name, price and VAT rate are read from the
//! price list each time, so a template follows price changes.

use std::collections::HashMap;

use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, QueryResult, Statement, TransactionTrait, Value,
};

use crate::models::medical::{
    CreateRecordTemplateInput, LastRecordCopy, RecordTemplate, RecordTemplateLineItem, RecordTemplateLineItemInput,
    UpdateRecordTemplateInput,
};
use crate::services::line_item::LineItemService;

const RECORD_TYPES: [&str; 3] = ["procedure", "note", "test_result"];

pub struct RecordTemplateService;

fn check_record_type(record_type: &str) -> Result<(), String> {
    if RECORD_TYPES.contains(&record_type) {
        Ok(())
    } else {
        Err(format!("Invalid record type: {}. Must be 'procedure', 'note', or 'test_result'", record_type))
    }
}

fn blank_to_none(text: Option<String>) -> Option<String> {
    text.filter(|t| !t.trim().is_empty())
}

fn row_to_template(row: &QueryResult) -> Result<RecordTemplate, String> {
    Ok(RecordTemplate {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        record_type: row.try_get("", "record_type").map_err(|e| format!("Failed to get record_type: {}", e))?,
        title: row.try_get("", "title").map_err(|e| format!("Failed to get title: {}", e))?,
        description: row.try_get("", "description").map_err(|e| format!("Failed to get description: {}", e))?,
        price: row.try_get("", "price").ok().flatten(),
        currency_id: row.try_get("", "currency_id").ok().flatten(),
        prescription_notes: row.try_get("", "prescription_notes").ok().flatten(),
        line_items: Vec::new(),
        diagnosis_ids: Vec::new(),
        created_at: row.try_get("", "created_at").map_err(|e| format!("Failed to get created_at: {}", e))?,
        updated_at: row.try_get("", "updated_at").map_err(|e| format!("Failed to get updated_at: {}", e))?,
    })
}

impl RecordTemplateService {
    pub async fn list(db: &DatabaseConnection, record_type: Option<&str>) -> Result<Vec<RecordTemplate>, String> {
        let rows = match record_type {
            Some(rt) => db
                .query_all(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT * FROM record_templates WHERE record_type = ? ORDER BY title ASC",
                    [rt.into()],
                ))
                .await,
            None => db
                .query_all(Statement::from_string(
                    DbBackend::Sqlite,
                    "SELECT * FROM record_templates ORDER BY record_type, title ASC".to_string(),
                ))
                .await,
        }
        .map_err(|e| format!("Failed to fetch record templates: {}", e))?;
        let mut templates = rows.iter().map(row_to_template).collect::<Result<Vec<_>, _>>()?;
        Self::fill_contents(db, &mut templates).await?;
        Ok(templates)
    }

    /// SQLite LIKE only folds ASCII case, so the match runs here with
    /// Unicode lowercase (Cyrillic titles). Clinics keep a handful of templates.
    pub async fn search(
        db: &DatabaseConnection,
        term: &str,
        record_type: Option<&str>,
    ) -> Result<Vec<RecordTemplate>, String> {
        let needle = term.trim().to_lowercase();
        Ok(Self::list(db, record_type)
            .await?
            .into_iter()
            .filter(|t| {
                needle.is_empty()
                    || t.title.to_lowercase().contains(&needle)
                    || t.description.to_lowercase().contains(&needle)
            })
            .collect())
    }

    pub async fn get(db: &DatabaseConnection, id: i64) -> Result<RecordTemplate, String> {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT * FROM record_templates WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch record template: {}", e))?
            .ok_or_else(|| "Template not found".to_string())?;
        let mut templates = vec![row_to_template(&row)?];
        Self::fill_contents(db, &mut templates).await?;
        Ok(templates.remove(0))
    }

    pub async fn create(db: &DatabaseConnection, input: CreateRecordTemplateInput) -> Result<RecordTemplate, String> {
        check_record_type(&input.record_type)?;
        let txn = db.begin().await.map_err(|e| format!("Failed to start saving the template: {}", e))?;
        let result = txn
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO record_templates (record_type, title, description, price, currency_id, prescription_notes) \
                 VALUES (?, ?, ?, ?, ?, ?)",
                [
                    input.record_type.clone().into(),
                    input.title.clone().into(),
                    input.description.clone().into(),
                    Value::Double(input.price),
                    Value::BigInt(input.currency_id),
                    Value::String(blank_to_none(input.prescription_notes).map(Box::new)),
                ],
            ))
            .await
            .map_err(|e| format!("Failed to create record template: {}", e))?;
        let id = result.last_insert_id() as i64;
        Self::replace_line_items(&txn, id, &input.line_items).await?;
        Self::replace_diagnoses(&txn, id, &input.diagnosis_ids).await?;
        txn.commit().await.map_err(|e| format!("Failed to save the template: {}", e))?;
        Self::get(db, id).await
    }

    pub async fn update(
        db: &DatabaseConnection,
        id: i64,
        input: UpdateRecordTemplateInput,
    ) -> Result<RecordTemplate, String> {
        if let Some(rt) = &input.record_type {
            check_record_type(rt)?;
        }
        let mut sets: Vec<&str> = Vec::new();
        let mut params: Vec<Value> = Vec::new();
        if let Some(rt) = input.record_type {
            sets.push("record_type = ?");
            params.push(rt.into());
        }
        if let Some(title) = input.title {
            sets.push("title = ?");
            params.push(title.into());
        }
        if let Some(description) = input.description {
            sets.push("description = ?");
            params.push(description.into());
        }
        if let Some(price) = input.price {
            sets.push("price = ?");
            params.push(Value::Double(Some(price)));
        }
        if let Some(currency_id) = input.currency_id {
            sets.push("currency_id = ?");
            params.push(Value::BigInt(Some(currency_id)));
        }
        if input.prescription_notes.is_some() {
            sets.push("prescription_notes = ?");
            params.push(Value::String(blank_to_none(input.prescription_notes).map(Box::new)));
        }

        let txn = db.begin().await.map_err(|e| format!("Failed to start saving the template: {}", e))?;
        if !sets.is_empty() {
            params.push(id.into());
            txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                format!("UPDATE record_templates SET {} WHERE id = ?", sets.join(", ")),
                params,
            ))
            .await
            .map_err(|e| format!("Failed to update template: {}", e))?;
        }
        if let Some(items) = &input.line_items {
            Self::replace_line_items(&txn, id, items).await?;
        }
        if let Some(ids) = &input.diagnosis_ids {
            Self::replace_diagnoses(&txn, id, ids).await?;
        }
        txn.commit().await.map_err(|e| format!("Failed to save the template: {}", e))?;
        Self::get(db, id).await
    }

    pub async fn delete(db: &DatabaseConnection, id: i64) -> Result<(), String> {
        let txn = db.begin().await.map_err(|e| format!("Failed to start deleting the template: {}", e))?;
        for sql in [
            "DELETE FROM record_template_line_items WHERE record_template_id = ?",
            "DELETE FROM record_template_diagnoses WHERE record_template_id = ?",
            "DELETE FROM record_templates WHERE id = ?",
        ] {
            txn.execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, [id.into()]))
                .await
                .map_err(|e| format!("Failed to delete template: {}", e))?;
        }
        txn.commit().await.map_err(|e| format!("Failed to delete template: {}", e))
    }

    /// The patient's latest consult (not archived, not a lab result) as a
    /// starting point for a new record; None when there is none.
    pub async fn last_record_copy(db: &DatabaseConnection, patient_id: i64) -> Result<Option<LastRecordCopy>, String> {
        let Some(row) = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, record_type, name, description, prescription_notes, CAST(created_at AS TEXT) AS created_at \
                 FROM medical_records \
                 WHERE patient_id = ? AND is_archived = 0 AND record_type != 'test_result' \
                 ORDER BY created_at DESC, id DESC LIMIT 1",
                [patient_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to find the last record: {}", e))?
        else {
            return Ok(None);
        };
        let record_id: i64 = row.try_get("", "id").map_err(|e| e.to_string())?;
        let diagnosis_ids = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT diagnosis_id FROM medical_record_diagnoses WHERE medical_record_id = ? ORDER BY diagnosis_id",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to read the last record's diagnoses: {}", e))?
            .iter()
            .map(|r| r.try_get::<i64>("", "diagnosis_id").map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Some(LastRecordCopy {
            record_id,
            record_type: row.try_get("", "record_type").map_err(|e| e.to_string())?,
            name: row.try_get("", "name").map_err(|e| e.to_string())?,
            created_at: row.try_get::<Option<String>>("", "created_at").map_err(|e| e.to_string())?.unwrap_or_default(),
            description: row.try_get("", "description").map_err(|e| e.to_string())?,
            prescription_notes: blank_to_none(row.try_get("", "prescription_notes").ok().flatten()),
            diagnosis_ids,
            line_items: LineItemService::get_line_items_for_record(db, record_id).await?,
        }))
    }

    async fn replace_line_items(
        txn: &DatabaseTransaction,
        template_id: i64,
        items: &[RecordTemplateLineItemInput],
    ) -> Result<(), String> {
        if let Some(bad) = items.iter().find(|i| i.quantity < 1) {
            return Err(format!("Quantity must be at least 1 (price-list item {})", bad.line_item_template_id));
        }
        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM record_template_line_items WHERE record_template_id = ?",
            [template_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to save the template's lines: {}", e))?;
        for (position, item) in items.iter().enumerate() {
            let known = txn
                .query_one(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT id FROM line_item_templates WHERE id = ?",
                    [item.line_item_template_id.into()],
                ))
                .await
                .map_err(|e| format!("Failed to check the price-list item: {}", e))?;
            if known.is_none() {
                return Err(format!("Unknown price-list item {}", item.line_item_template_id));
            }
            txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO record_template_line_items (record_template_id, line_item_template_id, quantity, position) \
                 VALUES (?, ?, ?, ?)",
                [
                    template_id.into(),
                    item.line_item_template_id.into(),
                    item.quantity.into(),
                    (position as i64).into(),
                ],
            ))
            .await
            .map_err(|e| format!("Failed to save the template's lines: {}", e))?;
        }
        Ok(())
    }

    async fn replace_diagnoses(txn: &DatabaseTransaction, template_id: i64, ids: &[i64]) -> Result<(), String> {
        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM record_template_diagnoses WHERE record_template_id = ?",
            [template_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to save the template's diagnoses: {}", e))?;
        for id in ids {
            let known = txn
                .query_one(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT id FROM diagnoses WHERE id = ?",
                    [(*id).into()],
                ))
                .await
                .map_err(|e| format!("Failed to check the diagnosis: {}", e))?;
            if known.is_none() {
                return Err(format!("Unknown diagnosis {}", id));
            }
            txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT OR IGNORE INTO record_template_diagnoses (record_template_id, diagnosis_id) VALUES (?, ?)",
                [template_id.into(), (*id).into()],
            ))
            .await
            .map_err(|e| format!("Failed to save the template's diagnoses: {}", e))?;
        }
        Ok(())
    }

    /// Load every template's lines (joined with the price list and its VAT
    /// rate) and diagnosis ids in two queries.
    async fn fill_contents(db: &DatabaseConnection, templates: &mut [RecordTemplate]) -> Result<(), String> {
        if templates.is_empty() {
            return Ok(());
        }
        let mut lines: HashMap<i64, Vec<RecordTemplateLineItem>> = HashMap::new();
        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT rtl.record_template_id, rtl.line_item_template_id, rtl.quantity, \
                        lit.name, lit.description, lit.default_price, lit.currency_id, lit.is_active, \
                        tr.id AS tax_rate_id, tr.name AS vat_name, tr.percent AS vat_percent \
                 FROM record_template_line_items rtl \
                 JOIN line_item_templates lit ON lit.id = rtl.line_item_template_id \
                 LEFT JOIN tax_rates tr ON tr.id = lit.default_tax_rate_id \
                 ORDER BY rtl.record_template_id, rtl.position, rtl.id"
                    .to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to read the templates' lines: {}", e))?;
        for r in rows {
            let template_id: i64 = r.try_get("", "record_template_id").map_err(|e| e.to_string())?;
            lines.entry(template_id).or_default().push(RecordTemplateLineItem {
                line_item_template_id: r.try_get("", "line_item_template_id").map_err(|e| e.to_string())?,
                quantity: r.try_get("", "quantity").map_err(|e| e.to_string())?,
                name: r.try_get("", "name").map_err(|e| e.to_string())?,
                description: r.try_get("", "description").ok().flatten(),
                unit_price: r.try_get("", "default_price").map_err(|e| e.to_string())?,
                currency_id: r.try_get("", "currency_id").map_err(|e| e.to_string())?,
                tax_rate_id: r.try_get("", "tax_rate_id").ok().flatten(),
                vat_name: r.try_get("", "vat_name").ok().flatten(),
                vat_percent: r.try_get("", "vat_percent").ok().flatten(),
                is_active: r.try_get("", "is_active").map_err(|e| e.to_string())?,
            });
        }

        let mut diagnoses: HashMap<i64, Vec<i64>> = HashMap::new();
        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT record_template_id, diagnosis_id FROM record_template_diagnoses \
                 ORDER BY record_template_id, diagnosis_id"
                    .to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to read the templates' diagnoses: {}", e))?;
        for r in rows {
            let template_id: i64 = r.try_get("", "record_template_id").map_err(|e| e.to_string())?;
            diagnoses
                .entry(template_id)
                .or_default()
                .push(r.try_get("", "diagnosis_id").map_err(|e| e.to_string())?);
        }

        for t in templates.iter_mut() {
            t.line_items = lines.remove(&t.id).unwrap_or_default();
            t.diagnosis_ids = diagnoses.remove(&t.id).unwrap_or_default();
        }
        Ok(())
    }
}
