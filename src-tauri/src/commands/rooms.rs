use tauri::State;
use chrono::{DateTime, Utc};
use crate::database::connection::DatabasePool;
use crate::services::rooms::RoomService;
use crate::models::{
    Room, CreateRoomInput, UpdateRoomInput, RoomFilter, RoomAvailability
};

#[tauri::command]
pub async fn get_rooms(
    pool: State<'_, DatabasePool>,
    filter: Option<RoomFilter>,
) -> Result<Vec<Room>, String> {
    let pool = pool.lock().await;
    let filter = filter.unwrap_or_default();
    RoomService::get_rooms(&*pool, filter)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_room(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<Room, String> {
    let pool = pool.lock().await;
    RoomService::get_room_by_id(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_room(
    pool: State<'_, DatabasePool>,
    input: CreateRoomInput,
) -> Result<Room, String> {
    let pool = pool.lock().await;
    RoomService::create_room(&*pool, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_room(
    pool: State<'_, DatabasePool>,
    id: i64,
    input: UpdateRoomInput,
) -> Result<Room, String> {
    let pool = pool.lock().await;
    RoomService::update_room(&*pool, id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_room_availability(
    pool: State<'_, DatabasePool>,
    room_id: i64,
    check_time: DateTime<Utc>,
) -> Result<RoomAvailability, String> {
    let pool = pool.lock().await;
    RoomService::get_room_availability(&*pool, room_id, check_time)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_room(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;
    RoomService::delete_room(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}