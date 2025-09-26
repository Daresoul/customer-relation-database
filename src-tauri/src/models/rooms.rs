use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Room {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub capacity: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomInput {
    pub name: String,
    pub description: Option<String>,
    pub capacity: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRoomInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub capacity: Option<i32>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomFilter {
    pub active_only: bool,
}

impl Default for RoomFilter {
    fn default() -> Self {
        Self { active_only: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomAvailability {
    pub room: Room,
    pub is_available: bool,
    pub next_available: Option<DateTime<Utc>>,
    pub current_appointments: Vec<RoomAppointmentSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoomAppointmentSlot {
    pub appointment_id: i64,
    pub patient_name: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub status: String,
}

impl CreateRoomInput {
    pub fn validate(&self) -> Result<(), String> {
        if self.name.is_empty() {
            return Err("Room name cannot be empty".to_string());
        }

        if self.name.len() > 100 {
            return Err("Room name must be 100 characters or less".to_string());
        }

        if let Some(capacity) = self.capacity {
            if capacity < 1 {
                return Err("Room capacity must be at least 1".to_string());
            }
        }

        Ok(())
    }
}

impl UpdateRoomInput {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(ref name) = self.name {
            if name.is_empty() {
                return Err("Room name cannot be empty".to_string());
            }
            if name.len() > 100 {
                return Err("Room name must be 100 characters or less".to_string());
            }
        }

        if let Some(capacity) = self.capacity {
            if capacity < 1 {
                return Err("Room capacity must be at least 1".to_string());
            }
        }

        Ok(())
    }
}