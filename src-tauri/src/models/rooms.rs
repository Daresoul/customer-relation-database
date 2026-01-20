use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::models::dto::MaybeNull;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Room {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub capacity: i32,
    pub color: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomInput {
    pub name: String,
    pub description: Option<String>,
    pub capacity: Option<i32>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRoomInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub capacity: Option<i32>,
    #[serde(default)]
    pub color: MaybeNull<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
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

    pub fn has_updates(&self) -> bool {
        self.name.is_some()
            || self.description.is_some()
            || self.capacity.is_some()
            || !matches!(self.color, MaybeNull::Undefined)
            || self.is_active.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod create_room_validation {
        use super::*;

        #[test]
        fn valid_room_with_all_fields_passes() {
            let input = CreateRoomInput {
                name: "Exam Room 1".to_string(),
                description: Some("Main examination room".to_string()),
                capacity: Some(2),
                color: Some("#3498db".to_string()),
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn valid_room_with_only_name_passes() {
            let input = CreateRoomInput {
                name: "Surgery".to_string(),
                description: None,
                capacity: None,
                color: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn empty_name_fails() {
            let input = CreateRoomInput {
                name: "".to_string(),
                description: None,
                capacity: None,
                color: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Room name cannot be empty");
        }

        #[test]
        fn name_exceeds_100_chars_fails() {
            let input = CreateRoomInput {
                name: "A".repeat(101),
                description: None,
                capacity: None,
                color: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Room name must be 100 characters or less");
        }

        #[test]
        fn name_exactly_100_chars_passes() {
            let input = CreateRoomInput {
                name: "A".repeat(100),
                description: None,
                capacity: None,
                color: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn capacity_zero_fails() {
            let input = CreateRoomInput {
                name: "Test Room".to_string(),
                description: None,
                capacity: Some(0),
                color: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Room capacity must be at least 1");
        }

        #[test]
        fn capacity_negative_fails() {
            let input = CreateRoomInput {
                name: "Test Room".to_string(),
                description: None,
                capacity: Some(-5),
                color: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Room capacity must be at least 1");
        }

        #[test]
        fn capacity_one_passes() {
            let input = CreateRoomInput {
                name: "Small Room".to_string(),
                description: None,
                capacity: Some(1),
                color: None,
            };
            assert!(input.validate().is_ok());
        }
    }

    mod update_room_validation {
        use super::*;

        #[test]
        fn empty_update_passes() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn valid_name_update_passes() {
            let input = UpdateRoomInput {
                name: Some("New Room Name".to_string()),
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn empty_name_update_fails() {
            let input = UpdateRoomInput {
                name: Some("".to_string()),
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Room name cannot be empty");
        }

        #[test]
        fn name_exceeds_100_chars_update_fails() {
            let input = UpdateRoomInput {
                name: Some("A".repeat(101)),
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Room name must be 100 characters or less");
        }

        #[test]
        fn capacity_zero_update_fails() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: Some(0),
                color: MaybeNull::Undefined,
                is_active: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Room capacity must be at least 1");
        }

        #[test]
        fn valid_capacity_update_passes() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: Some(10),
                color: MaybeNull::Undefined,
                is_active: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn is_active_update_passes() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: Some(false),
            };
            assert!(input.validate().is_ok());
        }
    }

    mod update_room_has_updates {
        use super::*;

        #[test]
        fn empty_update_has_no_updates() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: None,
            };
            assert!(!input.has_updates());
        }

        #[test]
        fn name_update_has_updates() {
            let input = UpdateRoomInput {
                name: Some("New Name".to_string()),
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: None,
            };
            assert!(input.has_updates());
        }

        #[test]
        fn description_update_has_updates() {
            let input = UpdateRoomInput {
                name: None,
                description: Some("New description".to_string()),
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: None,
            };
            assert!(input.has_updates());
        }

        #[test]
        fn capacity_update_has_updates() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: Some(5),
                color: MaybeNull::Undefined,
                is_active: None,
            };
            assert!(input.has_updates());
        }

        #[test]
        fn color_value_has_updates() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: None,
                color: MaybeNull::Value("#ff0000".to_string()),
                is_active: None,
            };
            assert!(input.has_updates());
        }

        #[test]
        fn color_null_has_updates() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: None,
                color: MaybeNull::Null,
                is_active: None,
            };
            assert!(input.has_updates());
        }

        #[test]
        fn is_active_update_has_updates() {
            let input = UpdateRoomInput {
                name: None,
                description: None,
                capacity: None,
                color: MaybeNull::Undefined,
                is_active: Some(true),
            };
            assert!(input.has_updates());
        }
    }

    mod room_filter {
        use super::*;

        #[test]
        fn default_filter_is_active_only() {
            let filter = RoomFilter::default();
            assert!(filter.active_only);
        }
    }
}