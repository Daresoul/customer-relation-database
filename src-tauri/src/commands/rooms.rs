use tauri::State;
use chrono::{DateTime, Utc};
use crate::database::SeaOrmPool;
use crate::services::rooms::RoomService;
use crate::models::{
    Room, CreateRoomInput, UpdateRoomInput, RoomFilter, RoomAvailability
};

#[tauri::command]
pub async fn get_rooms(
    pool: State<'_, SeaOrmPool>,
    filter: Option<RoomFilter>,
) -> Result<Vec<Room>, String> {
    let filter = filter.unwrap_or_default();
    RoomService::get_rooms(&pool, filter).await
}

#[tauri::command]
pub async fn get_room(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<Room, String> {
    RoomService::get_room_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_room(
    pool: State<'_, SeaOrmPool>,
    input: CreateRoomInput,
) -> Result<Room, String> {
    RoomService::create_room(&pool, input).await
}

#[tauri::command]
pub async fn update_room(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateRoomInput,
) -> Result<Room, String> {
    RoomService::update_room(&pool, id, input).await
}

#[tauri::command]
pub async fn get_room_availability(
    pool: State<'_, SeaOrmPool>,
    room_id: i64,
    check_time: DateTime<Utc>,
) -> Result<RoomAvailability, String> {
    RoomService::get_room_availability(&pool, room_id, check_time).await
}

#[tauri::command]
pub async fn delete_room(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<(), String> {
    RoomService::delete_room(&pool, id).await
}
