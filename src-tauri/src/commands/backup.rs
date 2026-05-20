use crate::database::SeaOrmPool;
use crate::services::backup::{BackupConfig, BackupService};
use std::path::PathBuf;
use tauri::{AppHandle, State};

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path_resolver()
        .app_data_dir()
        .ok_or_else(|| "Could not determine app data directory".to_string())
}

#[tauri::command]
pub fn get_backup_config(app: AppHandle) -> Result<BackupConfig, String> {
    let dir = app_data_dir(&app)?;
    Ok(BackupService::load_config(&dir))
}

#[tauri::command]
pub fn set_backup_directory(app: AppHandle, directory: String) -> Result<BackupConfig, String> {
    let dir = app_data_dir(&app)?;
    BackupService::set_directory(&dir, &directory)
}

#[tauri::command]
pub async fn run_backup_now(
    app: AppHandle,
    pool: State<'_, SeaOrmPool>,
) -> Result<BackupConfig, String> {
    let dir = app_data_dir(&app)?;
    BackupService::run_backup(&dir, &pool).await
}
