use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// UpdatePreferences model for auto-update system
/// Singleton pattern: Only one row with id=1 should exist
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UpdatePreferences {
    /// Singleton ID - always 1
    pub id: i64,

    /// Whether automatic update checking is enabled
    pub auto_check_enabled: bool,

    /// Timestamp of last update check (Unix timestamp)
    pub last_check_timestamp: Option<i64>,

    /// Version of last update that was notified to user
    pub last_notified_version: Option<String>,

    /// Creation timestamp (Unix timestamp)
    pub created_at: i64,

    /// Last update timestamp (Unix timestamp)
    pub updated_at: i64,
}

impl Default for UpdatePreferences {
    fn default() -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: 1,
            auto_check_enabled: true,
            last_check_timestamp: None,
            last_notified_version: None,
            created_at: now,
            updated_at: now,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_values() {
        let prefs = UpdatePreferences::default();

        assert_eq!(prefs.id, 1);
        assert_eq!(prefs.auto_check_enabled, true);
        assert!(prefs.last_check_timestamp.is_none());
        assert!(prefs.last_notified_version.is_none());
        assert!(prefs.created_at > 0);
        assert!(prefs.updated_at > 0);
    }

    #[test]
    fn test_serialization() {
        let prefs = UpdatePreferences::default();
        let json = serde_json::to_string(&prefs).unwrap();

        assert!(json.contains("\"id\":1"));
        assert!(json.contains("\"auto_check_enabled\":true"));
    }

    #[test]
    fn test_deserialization() {
        let json = r#"{
            "id": 1,
            "auto_check_enabled": false,
            "last_check_timestamp": 1706140800,
            "last_notified_version": "v1.2.0",
            "created_at": 1706140800,
            "updated_at": 1706140900
        }"#;

        let prefs: UpdatePreferences = serde_json::from_str(json).unwrap();

        assert_eq!(prefs.id, 1);
        assert_eq!(prefs.auto_check_enabled, false);
        assert_eq!(prefs.last_check_timestamp, Some(1706140800));
        assert_eq!(prefs.last_notified_version, Some("v1.2.0".to_string()));
    }
}
