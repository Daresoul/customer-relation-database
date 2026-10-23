//! The dev bridge lets a browser page drive the real backend: each call is
//! replayed through Tauri's IPC in the hidden main window, and the window
//! reports the result back with `dev_bridge_reply`.

use crate::services::dev_bridge::{replay_script, routes, subscribe_script, Bridge, Reply, ALLOWED_ORIGIN};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// A bridge whose "window" records every script it is asked to run.
fn recording_bridge() -> (Arc<Bridge>, Arc<Mutex<Vec<String>>>) {
    let scripts = Arc::new(Mutex::new(Vec::new()));
    let seen = scripts.clone();
    let bridge = Bridge::new(Box::new(move |script: String| {
        seen.lock().unwrap().push(script);
        Ok(())
    }));
    (bridge, scripts)
}

fn call_id(script: &str) -> u64 {
    let marker = "\"id\":";
    let start = script.find(marker).expect("script carries the call id") + marker.len();
    script[start..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap()
}

#[tokio::test]
async fn a_call_returns_what_the_window_replies() {
    let (bridge, scripts) = recording_bridge();
    let caller = bridge.clone();
    let call = tokio::spawn(async move {
        caller.call(json!({ "cmd": "get_households" }), Duration::from_secs(5)).await
    });

    tokio::time::sleep(Duration::from_millis(20)).await;
    let script = scripts.lock().unwrap()[0].clone();
    assert!(bridge.reply(call_id(&script), Reply { ok: true, payload: json!([{ "id": 1 }]) }));

    let reply = call.await.unwrap();
    assert_eq!(reply, Reply { ok: true, payload: json!([{ "id": 1 }]) });
}

#[tokio::test]
async fn a_call_nobody_answers_times_out_as_an_error() {
    let (bridge, _scripts) = recording_bridge();
    let reply = bridge.call(json!({ "cmd": "get_households" }), Duration::from_millis(30)).await;
    assert!(!reply.ok);
    assert!(reply.payload.as_str().unwrap().contains("timed out"));
}

#[tokio::test]
async fn a_window_that_cannot_run_the_script_is_an_error() {
    let bridge = Bridge::new(Box::new(|_| Err("no main window".to_string())));
    let reply = bridge.call(json!({ "cmd": "get_households" }), Duration::from_secs(1)).await;
    assert_eq!(reply, Reply { ok: false, payload: json!("no main window") });
}

#[test]
fn a_reply_for_an_unknown_call_is_ignored() {
    let (bridge, _scripts) = recording_bridge();
    assert!(!bridge.reply(42, Reply { ok: true, payload: json!(null) }));
}

#[test]
fn the_replay_script_sends_the_message_through_tauri_ipc_and_reports_back() {
    let script = replay_script(7, &json!({ "cmd": "create_patient", "name": "O'Brien \"</script>\"" }));
    assert!(script.contains("__TAURI_IPC__"));
    assert!(script.contains("dev_bridge_reply"));
    assert!(script.contains("\"id\":7"));
    // The message is embedded as JSON, so quotes in client data can't break out.
    assert!(script.contains(r#""name":"O'Brien \"</script>\"""#));
}

#[test]
fn the_subscribe_script_listens_through_the_event_module_and_forwards_events() {
    let script = subscribe_script("device-data-received");
    assert!(script.contains("\"__tauriModule\":\"Event\""));
    assert!(script.contains("\"event\":\"device-data-received\""));
    assert!(script.contains("dev_bridge_event"));
}

#[test]
fn each_event_name_is_subscribed_in_the_window_once() {
    let (bridge, scripts) = recording_bridge();
    bridge.subscribe("device-event").unwrap();
    bridge.subscribe("device-event").unwrap();
    bridge.subscribe("file-watcher-status").unwrap();
    assert_eq!(scripts.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn published_events_reach_every_listener() {
    let (bridge, _scripts) = recording_bridge();
    let mut events = bridge.events();
    bridge.publish("device-event", json!({ "kind": "parse_failed" }));
    let received = events.recv().await.unwrap();
    assert_eq!(received.event, "device-event");
    assert_eq!(received.payload, json!({ "kind": "parse_failed" }));
}

#[tokio::test]
async fn the_invoke_route_answers_the_browser_with_the_window_reply() {
    // A "window" that answers every call at once.
    let answering = Arc::new(Mutex::new(None::<Arc<Bridge>>));
    let handle = answering.clone();
    let bridge = Bridge::new(Box::new(move |script: String| {
        let bridge = handle.lock().unwrap().clone().unwrap();
        let id = call_id(&script);
        std::thread::spawn(move || {
            bridge.reply(id, Reply { ok: true, payload: json!("pong") });
        });
        Ok(())
    }));
    *answering.lock().unwrap() = Some(bridge.clone());

    let response = warp::test::request()
        .method("POST")
        .path("/invoke")
        .header("origin", ALLOWED_ORIGIN)
        .json(&json!({ "cmd": "ping" }))
        .reply(&routes(bridge))
        .await;

    assert_eq!(response.status(), 200);
    let body: Reply = serde_json::from_slice(response.body()).unwrap();
    assert_eq!(body, Reply { ok: true, payload: json!("pong") });
}

#[tokio::test]
async fn a_page_from_another_origin_is_refused() {
    let (bridge, scripts) = recording_bridge();
    let response = warp::test::request()
        .method("POST")
        .path("/invoke")
        .header("origin", "http://evil.example")
        .json(&json!({ "cmd": "wipe_database_data" }))
        .reply(&routes(bridge))
        .await;

    assert_eq!(response.status(), 403);
    assert!(scripts.lock().unwrap().is_empty());
}

#[tokio::test]
async fn the_subscribe_route_subscribes_the_window() {
    let (bridge, scripts) = recording_bridge();
    let response = warp::test::request()
        .method("POST")
        .path("/subscribe")
        .header("origin", ALLOWED_ORIGIN)
        .json(&json!({ "event": "device-data-received" }))
        .reply(&routes(bridge))
        .await;

    assert_eq!(response.status(), 200);
    assert_eq!(scripts.lock().unwrap().len(), 1);
}

// ---- the hidden window loads the host page after the bridge starts ----

#[tokio::test]
async fn a_call_waits_until_the_host_page_is_ready() {
    let scripts = Arc::new(Mutex::new(Vec::new()));
    let seen = scripts.clone();
    let bridge = Bridge::new_waiting(Box::new(move |script: String| {
        seen.lock().unwrap().push(script);
        Ok(())
    }));
    let caller = bridge.clone();
    let call = tokio::spawn(async move { caller.call(json!({ "cmd": "get_households" }), Duration::from_secs(5)).await });

    tokio::time::sleep(Duration::from_millis(30)).await;
    assert!(scripts.lock().unwrap().is_empty(), "nothing is sent to a window still loading");

    bridge.host_ready();
    tokio::time::sleep(Duration::from_millis(30)).await;
    let script = scripts.lock().unwrap()[0].clone();
    bridge.reply(call_id(&script), Reply { ok: true, payload: json!([]) });
    assert_eq!(call.await.unwrap(), Reply { ok: true, payload: json!([]) });
}

#[test]
fn subscriptions_are_sent_when_the_host_page_is_ready_and_again_after_it_reloads() {
    let scripts = Arc::new(Mutex::new(Vec::new()));
    let seen = scripts.clone();
    let bridge = Bridge::new_waiting(Box::new(move |script: String| {
        seen.lock().unwrap().push(script);
        Ok(())
    }));

    bridge.subscribe("device-data-received").unwrap();
    assert!(scripts.lock().unwrap().is_empty());

    bridge.host_ready();
    assert_eq!(scripts.lock().unwrap().len(), 1);

    // A reload of the host page drops its listeners.
    bridge.host_ready();
    assert_eq!(scripts.lock().unwrap().len(), 2);
    assert!(scripts.lock().unwrap()[1].contains("device-data-received"));
}
