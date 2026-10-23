//! Callbacks from the hidden window to the dev bridge (debug builds only).
//! See services::dev_bridge.

use crate::services::dev_bridge::{Bridge, Reply};
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn dev_bridge_reply(bridge: State<'_, Arc<Bridge>>, id: u64, reply: Reply) {
    bridge.reply(id, reply);
}

#[tauri::command]
pub fn dev_bridge_event(bridge: State<'_, Arc<Bridge>>, event: String, payload: Value) {
    bridge.publish(&event, payload);
}
