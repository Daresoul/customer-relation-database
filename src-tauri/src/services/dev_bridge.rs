//! Dev-only HTTP bridge (stub signatures; implementation follows).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use warp::Filter;

pub const ALLOWED_ORIGIN: &str = "http://localhost:1420";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Reply {
    pub ok: bool,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct BridgeEvent {
    pub event: String,
    pub payload: Value,
}

pub type Evaluator = Box<dyn Fn(String) -> Result<(), String> + Send + Sync>;

pub struct Bridge;

impl Bridge {
    pub fn new(_eval: Evaluator) -> Arc<Self> {
        Arc::new(Bridge)
    }
    pub async fn call(&self, _message: Value, _timeout: Duration) -> Reply {
        unimplemented!()
    }
    pub fn reply(&self, _id: u64, _reply: Reply) -> bool {
        unimplemented!()
    }
    pub fn subscribe(&self, _event: &str) -> Result<(), String> {
        unimplemented!()
    }
    pub fn publish(&self, _event: &str, _payload: Value) {
        unimplemented!()
    }
    pub fn events(&self) -> tokio::sync::broadcast::Receiver<BridgeEvent> {
        unimplemented!()
    }
}

pub fn replay_script(_id: u64, _message: &Value) -> String {
    String::new()
}

pub fn subscribe_script(_event: &str) -> String {
    String::new()
}

pub fn routes(_bridge: Arc<Bridge>) -> impl Filter<Extract = (warp::reply::Response,), Error = std::convert::Infallible> + Clone {
    warp::any().map(|| warp::reply::Response::new("".into()))
}
