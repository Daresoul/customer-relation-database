use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SyncLog {
    pub id: i64,
    pub direction: SyncDirection,
    pub sync_type: SyncType,
    pub status: SyncStatus,
    pub items_synced: i32,
    pub items_failed: i32,
    pub error_message: Option<String>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum SyncDirection {
    #[serde(rename = "to_google")]
    #[sqlx(rename = "to_google")]
    ToGoogle,
    #[serde(rename = "from_google")]
    #[sqlx(rename = "from_google")]
    FromGoogle,
}

impl std::fmt::Display for SyncDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncDirection::ToGoogle => write!(f, "to_google"),
            SyncDirection::FromGoogle => write!(f, "from_google"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum SyncType {
    #[serde(rename = "initial")]
    #[sqlx(rename = "initial")]
    Initial,
    #[serde(rename = "incremental")]
    #[sqlx(rename = "incremental")]
    Incremental,
    #[serde(rename = "manual")]
    #[sqlx(rename = "manual")]
    Manual,
}

impl std::fmt::Display for SyncType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncType::Initial => write!(f, "initial"),
            SyncType::Incremental => write!(f, "incremental"),
            SyncType::Manual => write!(f, "manual"),
        }
    }
}

pub type SyncLogCreate = CreateSyncLogInput;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppointmentSyncLog {
    pub id: i64,
    pub appointment_id: i64,
    pub external_id: Option<String>,
    pub sync_action: SyncAction,
    pub sync_status: SyncStatus,
    pub error_message: Option<String>,
    pub synced_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum SyncAction {
    #[serde(rename = "create")]
    #[sqlx(rename = "create")]
    Create,
    #[serde(rename = "update")]
    #[sqlx(rename = "update")]
    Update,
    #[serde(rename = "delete")]
    #[sqlx(rename = "delete")]
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum SyncStatus {
    #[serde(rename = "success")]
    #[sqlx(rename = "success")]
    Success,
    #[serde(rename = "failed")]
    #[sqlx(rename = "failed")]
    Failed,
    #[serde(rename = "pending")]
    #[sqlx(rename = "pending")]
    Pending,
    #[serde(rename = "partial")]
    #[sqlx(rename = "partial")]
    Partial,
    #[serde(rename = "in_progress")]
    #[sqlx(rename = "in_progress")]
    InProgress,
}

impl std::fmt::Display for SyncAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncAction::Create => write!(f, "create"),
            SyncAction::Update => write!(f, "update"),
            SyncAction::Delete => write!(f, "delete"),
        }
    }
}

impl std::fmt::Display for SyncStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncStatus::Success => write!(f, "success"),
            SyncStatus::Failed => write!(f, "failed"),
            SyncStatus::Pending => write!(f, "pending"),
            SyncStatus::Partial => write!(f, "partial"),
            SyncStatus::InProgress => write!(f, "in_progress"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSyncLogInput {
    pub direction: SyncDirection,
    pub sync_type: SyncType,
    pub status: SyncStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSyncLog {
    pub status: Option<SyncStatus>,
    pub items_synced: Option<i32>,
    pub items_failed: Option<i32>,
    pub error_message: Option<String>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItem {
    pub appointment_id: i64,
    pub action: SyncAction,
    pub retry_count: i32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub synced_count: i32,
    pub failed_count: i32,
    pub errors: Vec<SyncError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncError {
    pub appointment_id: i64,
    pub error: String,
    pub action: SyncAction,
}

impl AppointmentSyncLog {
    pub fn is_success(&self) -> bool {
        matches!(self.sync_status, SyncStatus::Success)
    }

    pub fn is_failed(&self) -> bool {
        matches!(self.sync_status, SyncStatus::Failed)
    }

    pub fn is_pending(&self) -> bool {
        matches!(self.sync_status, SyncStatus::Pending)
    }
}