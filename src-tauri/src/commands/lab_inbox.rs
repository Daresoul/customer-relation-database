use crate::database::SeaOrmPool;
use crate::services::file_storage::FileStorageService;
use crate::services::lab_inbox::{self, LabInboxItem, MoveOutcome};
use crate::services::medical_record::PdfEnv;
use tauri::{AppHandle, State};

/// Results in the lab inbox; `state` is waiting, attached or discarded (all when None).
#[tauri::command]
pub async fn list_lab_inbox(pool: State<'_, SeaOrmPool>, state: Option<String>) -> Result<Vec<LabInboxItem>, String> {
    lab_inbox::list_inbox(&pool, state.as_deref()).await
}

/// The values of a result as the inbox shows them, for the lab import list.
#[tauri::command]
pub fn preview_lab_values(device_type: String, test_results: serde_json::Value) -> Vec<lab_inbox::LabValue> {
    lab_inbox::lab_values(&device_type, &test_results)
}

#[tauri::command]
pub async fn get_lab_inbox_count(pool: State<'_, SeaOrmPool>) -> Result<i64, String> {
    lab_inbox::waiting_count(&pool).await
}

#[tauri::command]
pub async fn discard_lab_result(
    pool: State<'_, SeaOrmPool>,
    file_id: String,
    reason: String,
    note: Option<String>,
) -> Result<(), String> {
    lab_inbox::discard(&pool, &file_id, &reason, note).await
}

#[tauri::command]
pub async fn restore_lab_result(pool: State<'_, SeaOrmPool>, file_id: String) -> Result<(), String> {
    lab_inbox::restore(&pool, &file_id).await
}

/// Attach a received result to an existing record as a lab attachment.
/// Returns the new attachment's id.
#[tauri::command]
pub async fn attach_lab_result(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    file_id: String,
    medical_record_id: i64,
) -> Result<i64, String> {
    let storage_dir = FileStorageService::get_storage_dir(&app_handle)?;
    lab_inbox::attach_to_record(&pool, &storage_dir, &file_id, medical_record_id).await
}

/// Move a lab attachment to another record. The move is logged with this
/// computer's login name.
#[tauri::command]
pub async fn move_lab_result(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
    target_record_id: i64,
) -> Result<MoveOutcome, String> {
    let env = PdfEnv::from_app(&app_handle)?;
    let moved_by = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).ok();
    lab_inbox::move_result(&env, &pool, attachment_id, target_record_id, moved_by).await
}
