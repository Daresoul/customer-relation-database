//! Record templates (Settings › Record templates) and "Copy from last record".

use sea_orm::DatabaseConnection;

use crate::models::medical::{
    CreateRecordTemplateInput, LastRecordCopy, RecordTemplate, UpdateRecordTemplateInput,
};

pub struct RecordTemplateService;

impl RecordTemplateService {
    pub async fn list(_db: &DatabaseConnection, _record_type: Option<&str>) -> Result<Vec<RecordTemplate>, String> {
        Err("not implemented".into())
    }

    pub async fn search(
        _db: &DatabaseConnection,
        _term: &str,
        _record_type: Option<&str>,
    ) -> Result<Vec<RecordTemplate>, String> {
        Err("not implemented".into())
    }

    pub async fn get(_db: &DatabaseConnection, _id: i64) -> Result<RecordTemplate, String> {
        Err("not implemented".into())
    }

    pub async fn create(_db: &DatabaseConnection, _input: CreateRecordTemplateInput) -> Result<RecordTemplate, String> {
        Err("not implemented".into())
    }

    pub async fn update(
        _db: &DatabaseConnection,
        _id: i64,
        _input: UpdateRecordTemplateInput,
    ) -> Result<RecordTemplate, String> {
        Err("not implemented".into())
    }

    pub async fn delete(_db: &DatabaseConnection, _id: i64) -> Result<(), String> {
        Err("not implemented".into())
    }

    pub async fn last_record_copy(_db: &DatabaseConnection, _patient_id: i64) -> Result<Option<LastRecordCopy>, String> {
        Err("not implemented".into())
    }
}
