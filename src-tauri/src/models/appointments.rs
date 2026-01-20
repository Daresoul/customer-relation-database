use chrono::{DateTime, Utc, Timelike};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Appointment {
    pub id: i64,
    pub patient_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub room_id: Option<i64>,
    pub status: AppointmentStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_by: String,
    // Patient fields (populated by JOIN queries)
    pub patient_name: Option<String>,
    pub species: Option<String>,
    pub breed: Option<String>,
    pub microchip_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum AppointmentStatus {
    #[serde(rename = "scheduled")]
    #[sqlx(rename = "scheduled")]
    Scheduled,
    #[serde(rename = "in_progress")]
    #[sqlx(rename = "in_progress")]
    InProgress,
    #[serde(rename = "completed")]
    #[sqlx(rename = "completed")]
    Completed,
    #[serde(rename = "cancelled")]
    #[sqlx(rename = "cancelled")]
    Cancelled,
}

impl std::fmt::Display for AppointmentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppointmentStatus::Scheduled => write!(f, "scheduled"),
            AppointmentStatus::InProgress => write!(f, "in_progress"),
            AppointmentStatus::Completed => write!(f, "completed"),
            AppointmentStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppointmentDetail {
    #[serde(flatten)]
    pub appointment: Appointment,
    pub patient: Option<PatientInfo>,
    pub room: Option<Room>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PatientInfo {
    pub id: i64,
    pub name: String,
    pub species: Option<String>,
    pub breed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAppointmentInput {
    pub patient_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub room_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateAppointmentInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub room_id: Option<i64>,
    pub status: Option<AppointmentStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppointmentFilter {
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub patient_id: Option<i64>,
    pub room_id: Option<i64>,
    pub status: Option<AppointmentStatus>,
    pub include_deleted: bool,
    pub include_cancelled: Option<bool>,
}

impl Default for AppointmentFilter {
    fn default() -> Self {
        Self {
            start_date: None,
            end_date: None,
            patient_id: None,
            room_id: None,
            status: None,
            include_deleted: false,
            include_cancelled: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppointmentListResponse {
    pub appointments: Vec<Appointment>,
    pub total: i64,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateAppointmentInput {
    pub appointment_id: i64,
    pub target_date: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictCheckInput {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub room_id: Option<i64>,
    pub exclude_appointment_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictCheckResponse {
    pub has_conflicts: bool,
    pub conflicts: Vec<Appointment>,
}

// Validation helpers
impl CreateAppointmentInput {
    pub fn validate(&self) -> Result<(), String> {
        // Check title length
        if self.title.len() > 200 {
            return Err("Title must be 200 characters or less".to_string());
        }

        // Check end time is after start time
        if self.end_time <= self.start_time {
            return Err("End time must be after start time".to_string());
        }

        // Check 15-minute intervals
        if self.start_time.minute() % 15 != 0 {
            return Err("Start time must be on a 15-minute interval".to_string());
        }
        if self.end_time.minute() % 15 != 0 {
            return Err("End time must be on a 15-minute interval".to_string());
        }

        // Check minimum duration (15 minutes)
        let duration = self.end_time - self.start_time;
        if duration.num_minutes() < 15 {
            return Err("Appointment must be at least 15 minutes long".to_string());
        }

        // Check maximum duration (8 hours)
        if duration.num_hours() > 8 {
            return Err("Appointment cannot exceed 8 hours".to_string());
        }

        Ok(())
    }
}

impl UpdateAppointmentInput {
    pub fn validate(&self) -> Result<(), String> {
        // Check title length if provided
        if let Some(ref title) = self.title {
            if title.len() > 200 {
                return Err("Title must be 200 characters or less".to_string());
            }
        }

        // Check times if both provided
        if let (Some(start), Some(end)) = (self.start_time, self.end_time) {
            if end <= start {
                return Err("End time must be after start time".to_string());
            }

            // Check 15-minute intervals
            if start.minute() % 15 != 0 {
                return Err("Start time must be on a 15-minute interval".to_string());
            }
            if end.minute() % 15 != 0 {
                return Err("End time must be on a 15-minute interval".to_string());
            }

            // Check duration limits
            let duration = end - start;
            if duration.num_minutes() < 15 {
                return Err("Appointment must be at least 15 minutes long".to_string());
            }
            if duration.num_hours() > 8 {
                return Err("Appointment cannot exceed 8 hours".to_string());
            }
        }

        Ok(())
    }
}

// Import Room from rooms module
use crate::models::rooms::Room;

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone};

    fn make_time(hour: u32, minute: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2024, 6, 15, hour, minute, 0).unwrap()
    }

    mod create_appointment_validation {
        use super::*;

        #[test]
        fn valid_appointment_passes() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Annual Checkup".to_string(),
                description: Some("Regular yearly examination".to_string()),
                start_time: make_time(10, 0),
                end_time: make_time(10, 30),
                room_id: Some(1),
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn valid_appointment_without_room_passes() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Home Visit".to_string(),
                description: None,
                start_time: make_time(14, 0),
                end_time: make_time(15, 0),
                room_id: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn title_exceeds_200_chars_fails() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "A".repeat(201),
                description: None,
                start_time: make_time(10, 0),
                end_time: make_time(10, 30),
                room_id: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Title must be 200 characters or less");
        }

        #[test]
        fn title_exactly_200_chars_passes() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "A".repeat(200),
                description: None,
                start_time: make_time(10, 0),
                end_time: make_time(10, 30),
                room_id: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn end_time_before_start_time_fails() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Test".to_string(),
                description: None,
                start_time: make_time(11, 0),
                end_time: make_time(10, 0),
                room_id: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "End time must be after start time");
        }

        #[test]
        fn end_time_equals_start_time_fails() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Test".to_string(),
                description: None,
                start_time: make_time(10, 0),
                end_time: make_time(10, 0),
                room_id: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "End time must be after start time");
        }

        #[test]
        fn start_time_not_on_15_min_interval_fails() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Test".to_string(),
                description: None,
                start_time: make_time(10, 7), // 10:07 is not valid
                end_time: make_time(10, 30),
                room_id: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Start time must be on a 15-minute interval");
        }

        #[test]
        fn end_time_not_on_15_min_interval_fails() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Test".to_string(),
                description: None,
                start_time: make_time(10, 0),
                end_time: make_time(10, 23), // 10:23 is not valid
                room_id: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "End time must be on a 15-minute interval");
        }

        #[test]
        fn valid_15_min_intervals_pass() {
            // Test all valid intervals: 0, 15, 30, 45
            for minute in [0, 15, 30, 45] {
                let input = CreateAppointmentInput {
                    patient_id: 1,
                    title: "Test".to_string(),
                    description: None,
                    start_time: make_time(10, minute),
                    end_time: make_time(11, minute),
                    room_id: None,
                };
                assert!(input.validate().is_ok(), "Failed for minute: {}", minute);
            }
        }

        #[test]
        fn duration_less_than_15_min_fails() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Test".to_string(),
                description: None,
                start_time: make_time(10, 0),
                end_time: make_time(10, 0) + Duration::minutes(10),
                room_id: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            // This will fail on 15-min interval check first
        }

        #[test]
        fn duration_exactly_15_min_passes() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Quick Checkup".to_string(),
                description: None,
                start_time: make_time(10, 0),
                end_time: make_time(10, 15),
                room_id: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn duration_exceeds_8_hours_fails() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Test".to_string(),
                description: None,
                start_time: make_time(8, 0),
                end_time: make_time(8, 0) + Duration::hours(9),
                room_id: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Appointment cannot exceed 8 hours");
        }

        #[test]
        fn duration_exactly_8_hours_passes() {
            let input = CreateAppointmentInput {
                patient_id: 1,
                title: "Full Day Surgery".to_string(),
                description: None,
                start_time: make_time(8, 0),
                end_time: make_time(16, 0),
                room_id: None,
            };
            assert!(input.validate().is_ok());
        }
    }

    mod update_appointment_validation {
        use super::*;

        #[test]
        fn empty_update_passes() {
            let input = UpdateAppointmentInput {
                title: None,
                description: None,
                start_time: None,
                end_time: None,
                room_id: None,
                status: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn title_update_exceeds_200_chars_fails() {
            let input = UpdateAppointmentInput {
                title: Some("A".repeat(201)),
                description: None,
                start_time: None,
                end_time: None,
                room_id: None,
                status: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "Title must be 200 characters or less");
        }

        #[test]
        fn valid_time_update_passes() {
            let input = UpdateAppointmentInput {
                title: None,
                description: None,
                start_time: Some(make_time(14, 0)),
                end_time: Some(make_time(15, 30)),
                room_id: None,
                status: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn end_before_start_update_fails() {
            let input = UpdateAppointmentInput {
                title: None,
                description: None,
                start_time: Some(make_time(15, 0)),
                end_time: Some(make_time(14, 0)),
                room_id: None,
                status: None,
            };
            let result = input.validate();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "End time must be after start time");
        }

        #[test]
        fn only_start_time_update_passes() {
            // When only one time is provided, validation is skipped
            let input = UpdateAppointmentInput {
                title: None,
                description: None,
                start_time: Some(make_time(10, 7)), // Invalid interval but no end_time to compare
                end_time: None,
                room_id: None,
                status: None,
            };
            assert!(input.validate().is_ok());
        }

        #[test]
        fn status_update_only_passes() {
            let input = UpdateAppointmentInput {
                title: None,
                description: None,
                start_time: None,
                end_time: None,
                room_id: None,
                status: Some(AppointmentStatus::Completed),
            };
            assert!(input.validate().is_ok());
        }
    }

    mod appointment_status {
        use super::*;

        #[test]
        fn display_formats_correctly() {
            assert_eq!(format!("{}", AppointmentStatus::Scheduled), "scheduled");
            assert_eq!(format!("{}", AppointmentStatus::InProgress), "in_progress");
            assert_eq!(format!("{}", AppointmentStatus::Completed), "completed");
            assert_eq!(format!("{}", AppointmentStatus::Cancelled), "cancelled");
        }

        #[test]
        fn equality_works() {
            assert_eq!(AppointmentStatus::Scheduled, AppointmentStatus::Scheduled);
            assert_ne!(AppointmentStatus::Scheduled, AppointmentStatus::Cancelled);
        }
    }

    mod appointment_filter {
        use super::*;

        #[test]
        fn default_filter_excludes_deleted() {
            let filter = AppointmentFilter::default();
            assert!(!filter.include_deleted);
            assert!(filter.include_cancelled.is_none());
            assert!(filter.start_date.is_none());
            assert!(filter.end_date.is_none());
            assert!(filter.patient_id.is_none());
            assert!(filter.room_id.is_none());
            assert!(filter.status.is_none());
        }
    }
}