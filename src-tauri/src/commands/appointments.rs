use tauri::State;
use crate::database::connection::DatabasePool;
use crate::services::appointments::AppointmentService;
use crate::models::{
    Appointment, AppointmentDetail, AppointmentListResponse,
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter,
    ConflictCheckInput, ConflictCheckResponse, DuplicateAppointmentInput
};

#[tauri::command]
pub async fn get_appointments(
    pool: State<'_, DatabasePool>,
    filter: AppointmentFilter,
    limit: i64,
    offset: i64,
) -> Result<AppointmentListResponse, String> {
    println!("get_appointments called with filter: {:?}, limit: {}, offset: {}", filter, limit, offset);
    let pool = pool.lock().await;
    let result = AppointmentService::get_appointments(&*pool, filter, limit, offset).await;
    match &result {
        Ok(response) => {
            println!("get_appointments returning {} appointments, total: {}", response.appointments.len(), response.total);
        }
        Err(e) => {
            println!("get_appointments error: {}", e);
        }
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_appointment(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<AppointmentDetail, String> {
    let pool = pool.lock().await;
    AppointmentService::get_appointment_by_id(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_appointment(
    pool: State<'_, DatabasePool>,
    input: CreateAppointmentInput,
    created_by: Option<String>,
) -> Result<Appointment, String> {
    let pool = pool.lock().await;
    let created_by = created_by.unwrap_or_else(|| "system".to_string());
    AppointmentService::create_appointment(&*pool, input, created_by)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_appointment(
    pool: State<'_, DatabasePool>,
    id: i64,
    input: UpdateAppointmentInput,
    updated_by: Option<String>,
) -> Result<Appointment, String> {
    let pool = pool.lock().await;
    let updated_by = updated_by.unwrap_or_else(|| "system".to_string());
    AppointmentService::update_appointment(&*pool, id, input, updated_by)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_appointment(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;
    AppointmentService::delete_appointment(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_conflicts(
    pool: State<'_, DatabasePool>,
    input: ConflictCheckInput,
) -> Result<ConflictCheckResponse, String> {
    let pool = pool.lock().await;
    AppointmentService::check_conflicts(&*pool, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_appointment(
    pool: State<'_, DatabasePool>,
    input: DuplicateAppointmentInput,
    created_by: Option<String>,
) -> Result<Appointment, String> {
    let pool = pool.lock().await;
    let created_by = created_by.unwrap_or_else(|| "system".to_string());
    AppointmentService::duplicate_appointment(&*pool, input, created_by)
        .await
        .map_err(|e| e.to_string())
}