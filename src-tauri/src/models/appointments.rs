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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAppointmentInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub room_id: Option<i64>,
    pub status: Option<AppointmentStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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