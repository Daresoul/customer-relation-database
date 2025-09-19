use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewPreference {
    pub active_view: ViewType,
    pub last_switched: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewType {
    Animal,
    Household,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetViewPreferenceCommand {
    #[serde(rename = "activeView")]
    pub active_view: ViewType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetViewPreferenceResponse {
    pub success: bool,
    #[serde(rename = "activeView")]
    pub active_view: ViewType,
}

// Global state for view preference (in-memory for now)
type ViewPreferenceState = Arc<Mutex<ViewPreference>>;

impl Default for ViewPreference {
    fn default() -> Self {
        Self {
            active_view: ViewType::Animal,
            last_switched: None,
        }
    }
}

#[tauri::command]
pub async fn get_view_preference(
    app: AppHandle,
) -> Result<ViewPreference, String> {
    // Get or initialize state
    let state = if let Some(state) = app.try_state::<ViewPreferenceState>() {
        state.inner().clone()
    } else {
        let new_state = Arc::new(Mutex::new(ViewPreference::default()));
        app.manage(new_state.clone());
        new_state
    };

    let preference = state.lock().await;
    Ok(preference.clone())
}

#[tauri::command]
pub async fn set_view_preference(
    app: AppHandle,
    active_view: ViewType,
) -> Result<SetViewPreferenceResponse, String> {
    // Validate view type
    let view_type = active_view;

    // Get or initialize state
    let state = if let Some(state) = app.try_state::<ViewPreferenceState>() {
        state.inner().clone()
    } else {
        let new_state = Arc::new(Mutex::new(ViewPreference::default()));
        app.manage(new_state.clone());
        new_state
    };

    // Update preference
    {
        let mut preference = state.lock().await;
        preference.active_view = view_type.clone();
        preference.last_switched = Some(chrono::Utc::now().to_rfc3339());
    }

    Ok(SetViewPreferenceResponse {
        success: true,
        active_view: view_type,
    })
}