//! Dev-only HTTP bridge so a browser page (Playwright) can drive the real
//! backend. Compiled into debug builds only and started only with
//! `ARKIVET_DEV_BRIDGE=1`; it listens on 127.0.0.1 and answers one origin.
//!
//! The commands can't be called from outside a webview (they take the real
//! window type), so each browser call is replayed through Tauri's own IPC
//! in the hidden main window, parked on an empty page. The window reports
//! the result with `dev_bridge_reply`; app events come back through
//! `dev_bridge_event` and go out to the browser as server-sent events.

use futures_util::stream;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{broadcast, oneshot};
use warp::Filter;

pub const PORT: u16 = 1421;
/// The Vite dev server the browser page is loaded from.
pub const ALLOWED_ORIGIN: &str = "http://localhost:1420";
/// Where the hidden window waits, so it doesn't run the app a second time.
pub const HOST_PAGE: &str = "/bridge-host.html";
/// Backups, PDFs and demo-data seeding can take minutes.
const CALL_TIMEOUT: Duration = Duration::from_secs(300);

static ENABLED: AtomicBool = AtomicBool::new(false);

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

/// Runs a script in the hidden window.
pub type Evaluator = Box<dyn Fn(String) -> Result<(), String> + Send + Sync>;

pub struct Bridge {
    eval: Evaluator,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Reply>>>,
    subscribed: Mutex<HashSet<String>>,
    events: broadcast::Sender<BridgeEvent>,
}

impl Bridge {
    pub fn new(eval: Evaluator) -> Arc<Self> {
        let (events, _) = broadcast::channel(256);
        Arc::new(Bridge {
            eval,
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            subscribed: Mutex::new(HashSet::new()),
            events,
        })
    }

    /// Replays one IPC message (as `@tauri-apps/api` sends it, minus the
    /// callback ids) in the window and waits for its result.
    pub async fn call(&self, message: Value, timeout: Duration) -> Reply {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);

        if let Err(e) = (self.eval)(replay_script(id, &message)) {
            self.pending.lock().unwrap().remove(&id);
            return Reply { ok: false, payload: json!(e) };
        }

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(reply)) => reply,
            _ => {
                self.pending.lock().unwrap().remove(&id);
                let cmd = message.get("cmd").and_then(Value::as_str).unwrap_or("?");
                Reply { ok: false, payload: json!(format!("dev bridge: {cmd} timed out")) }
            }
        }
    }

    /// Completes a pending call; false when nothing waits for `id`.
    pub fn reply(&self, id: u64, reply: Reply) -> bool {
        match self.pending.lock().unwrap().remove(&id) {
            Some(tx) => tx.send(reply).is_ok(),
            None => false,
        }
    }

    /// Starts forwarding an app event from the window, once per name.
    pub fn subscribe(&self, event: &str) -> Result<(), String> {
        if !self.subscribed.lock().unwrap().insert(event.to_string()) {
            return Ok(());
        }
        let result = (self.eval)(subscribe_script(event));
        if result.is_err() {
            self.subscribed.lock().unwrap().remove(event);
        }
        result
    }

    /// Like `new`, but holds calls and subscriptions until `host_ready`.
    pub fn new_waiting(eval: Evaluator) -> Arc<Self> {
        Self::new(eval)
    }

    /// The host page (re)loaded: its listeners are fresh.
    pub fn host_ready(&self) {}

    pub fn publish(&self, event: &str, payload: Value) {
        // No browser listening is fine.
        let _ = self.events.send(BridgeEvent { event: event.to_string(), payload });
    }

    pub fn events(&self) -> broadcast::Receiver<BridgeEvent> {
        self.events.subscribe()
    }
}

/// The same callback/IPC plumbing `@tauri-apps/api` uses, defined once.
const BOOTSTRAP: &str = r#"window.__arkivetBridge = window.__arkivetBridge || (function () {
  function callback(fn, once) {
    var id = window.crypto.getRandomValues(new Uint32Array(1))[0];
    var key = '_' + id;
    Object.defineProperty(window, key, {
      value: function (result) {
        if (once) { Reflect.deleteProperty(window, key); }
        return fn(result);
      },
      writable: false,
      configurable: true
    });
    return id;
  }
  function ipc(message) {
    return new Promise(function (resolve, reject) {
      window.__TAURI_IPC__(Object.assign({}, message, {
        callback: callback(resolve, true),
        error: callback(reject, true)
      }));
    });
  }
  function plain(value) {
    if (value === undefined) { return null; }
    if (value instanceof Error) { return String(value); }
    return value;
  }
  return { callback: callback, ipc: ipc, plain: plain };
})();
"#;

pub fn replay_script(id: u64, message: &Value) -> String {
    let reply_head = json!({ "cmd": "dev_bridge_reply", "id": id });
    format!(
        "{BOOTSTRAP}window.__arkivetBridge.ipc({message}).then(\n  function (r) {{ return {{ ok: true, payload: window.__arkivetBridge.plain(r) }}; }},\n  function (e) {{ return {{ ok: false, payload: window.__arkivetBridge.plain(e) }}; }}\n).then(function (reply) {{\n  return window.__arkivetBridge.ipc(Object.assign({reply_head}, {{ reply: reply }}));\n}});\n"
    )
}

pub fn subscribe_script(event: &str) -> String {
    let listen = json!({
        "cmd": "tauri",
        "__tauriModule": "Event",
        "message": { "cmd": "listen", "event": event, "windowLabel": null }
    });
    format!(
        "{BOOTSTRAP}(function () {{\n  var m = {listen};\n  m.message.handler = window.__arkivetBridge.callback(function (e) {{\n    window.__arkivetBridge.ipc({{ cmd: 'dev_bridge_event', event: e.event, payload: window.__arkivetBridge.plain(e.payload) }});\n  }}, false);\n  window.__arkivetBridge.ipc(m);\n}})();\n"
    )
}

#[derive(Deserialize)]
struct SubscribeBody {
    event: String,
}

pub fn routes(
    bridge: Arc<Bridge>,
) -> impl Filter<Extract = (impl warp::Reply,), Error = warp::Rejection> + Clone {
    let with_bridge = warp::any().map(move || bridge.clone());

    let invoke = warp::post()
        .and(warp::path("invoke"))
        .and(warp::path::end())
        .and(warp::body::json())
        .and(with_bridge.clone())
        .then(|message: Value, bridge: Arc<Bridge>| async move {
            warp::reply::json(&bridge.call(message, CALL_TIMEOUT).await)
        });

    let subscribe = warp::post()
        .and(warp::path("subscribe"))
        .and(warp::path::end())
        .and(warp::body::json())
        .and(with_bridge.clone())
        .map(|body: SubscribeBody, bridge: Arc<Bridge>| {
            let reply = match bridge.subscribe(&body.event) {
                Ok(()) => Reply { ok: true, payload: Value::Null },
                Err(e) => Reply { ok: false, payload: json!(e) },
            };
            warp::reply::json(&reply)
        });

    let events = warp::get()
        .and(warp::path("events"))
        .and(warp::path::end())
        .and(with_bridge)
        .map(|bridge: Arc<Bridge>| {
            let stream = stream::unfold(bridge.events(), |mut rx| async move {
                loop {
                    match rx.recv().await {
                        Ok(event) => {
                            let sse = warp::sse::Event::default()
                                .json_data(&event)
                                .unwrap_or_else(|_| warp::sse::Event::default().data("{}"));
                            return Some((Ok::<_, Infallible>(sse), rx));
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => return None,
                    }
                }
            });
            warp::sse::reply(warp::sse::keep_alive().stream(stream))
        });

    let cors = warp::cors()
        .allow_origin(ALLOWED_ORIGIN)
        .allow_methods(vec!["GET", "POST"])
        .allow_headers(vec!["content-type"]);

    invoke.or(subscribe).or(events).with(cors)
}

pub fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// Starts the bridge when `ARKIVET_DEV_BRIDGE=1`. Call from `setup`.
pub fn start(app: &tauri::AppHandle) {
    use tauri::Manager;

    if std::env::var("ARKIVET_DEV_BRIDGE").ok().as_deref() != Some("1") {
        return;
    }
    ENABLED.store(true, Ordering::Relaxed);

    let handle = app.clone();
    let bridge = Bridge::new(Box::new(move |script: String| {
        let window = handle.get_window("main").ok_or_else(|| "no main window".to_string())?;
        window.eval(&script).map_err(|e| e.to_string())
    }));
    app.manage(bridge.clone());

    tauri::async_runtime::spawn(async move {
        log::warn!("Dev bridge listening on http://127.0.0.1:{PORT} for {ALLOWED_ORIGIN}");
        warp::serve(routes(bridge)).run(([127, 0, 0, 1], PORT)).await;
    });
}

/// Keeps the hidden window on the empty host page while the bridge runs.
pub fn on_page_load(window: tauri::Window, payload: tauri::PageLoadPayload) {
    if enabled() && !payload.url().contains(HOST_PAGE) {
        let _ = window.eval(&format!("window.location.replace('{HOST_PAGE}')"));
    }
}
