//! Watched folders: Exigo per-day files offered once per sample, settle check,
//! catch-up after a restart, and watcher start/stop/lost decisions.

use crate::services::device_events::{DeviceEvent, DeviceErrorKind, DeviceSink};
use crate::services::device_parser::{DeviceData, DeviceParserService};
use crate::services::file_watcher::{
    catch_up, pattern_matches, plan_watchers, process_file, rescan_recent, split_exigo_samples,
    wait_until_settled, DirState, ProcessMode, WatchAction, WatchConfig, WatchContext,
};
use crate::test_utils::{create_test_db_with_migrations, TestDb};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

const DAY_FILE: &str = include_str!("../../tests/fixtures/exigo_daily_two_samples.xml");

fn second_sample_at() -> usize {
    let first = DAY_FILE.find("<sample ").unwrap();
    first + 1 + DAY_FILE[first + 1..].find("<sample ").unwrap()
}

fn first_sample_only() -> String {
    format!("{}</samples>\n", &DAY_FILE[..second_sample_at()])
}

fn cut_inside_second_sample() -> String {
    DAY_FILE[..second_sample_at() + 200].to_string()
}

#[derive(Default)]
struct RecordingSink {
    results: Mutex<Vec<(serde_json::Value, DeviceData)>>,
    events: Mutex<Vec<DeviceEvent>>,
}

impl RecordingSink {
    fn patient_ids(&self) -> Vec<String> {
        self.results
            .lock()
            .unwrap()
            .iter()
            .map(|(_, d)| d.patient_identifier.clone().unwrap_or_default())
            .collect()
    }
}

impl DeviceSink for RecordingSink {
    fn result_ready(&self, payload: &serde_json::Value, data: &DeviceData) {
        self.results.lock().unwrap().push((payload.clone(), data.clone()));
    }
    fn device_event(&self, event: &DeviceEvent) {
        self.events.lock().unwrap().push(event.clone());
    }
    fn result_recorded(&self, _integration_id: i64) {}
}

struct Folder {
    _db: TestDb,
    ctx: WatchContext,
    watch: tempfile::TempDir,
    _storage: tempfile::TempDir,
}

impl Folder {
    fn file(&self, name: &str) -> PathBuf {
        self.watch.path().join(name)
    }
}

async fn exigo_folder() -> Folder {
    let db = create_test_db_with_migrations().await;
    let watch = tempfile::tempdir().unwrap();
    let storage = tempfile::tempdir().unwrap();
    let ctx = WatchContext {
        db: Arc::new(db.db.clone()),
        storage_dir: storage.path().to_path_buf(),
        config: WatchConfig {
            integration_id: 7,
            name: "Exigo".to_string(),
            directory: watch.path().display().to_string(),
            pattern: "*.xml".to_string(),
            device_type: "exigo_eos_vet".to_string(),
            set_up_at: None,
        },
    };
    Folder { _db: db, ctx, watch, _storage: storage }
}

fn write_old(path: &Path, content: &str) {
    std::fs::write(path, content).unwrap();
    let old = SystemTime::now() - Duration::from_secs(60);
    std::fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(old)
        .unwrap();
}

// ---- splitting the per-day file ----

#[test]
fn a_day_file_splits_into_one_document_per_sample_keyed_by_sno_and_seq() {
    let samples = split_exigo_samples(DAY_FILE.as_bytes());
    let keys: Vec<_> = samples.iter().map(|s| s.key.as_str()).collect();
    assert_eq!(keys, vec!["53672:1219", "53672:1220"]);

    let ids: Vec<_> = samples
        .iter()
        .map(|s| {
            DeviceParserService::parse_device_data("exigo_eos_vet", "Exigo", "s.xml", &s.xml, "file_watch")
                .unwrap()
                .patient_identifier
                .unwrap()
        })
        .collect();
    assert_eq!(ids, vec!["KOKO", "KIRE"], "each document holds only its own sample");
}

#[test]
fn a_sample_still_being_written_is_not_split_out() {
    let samples = split_exigo_samples(cut_inside_second_sample().as_bytes());
    assert_eq!(samples.len(), 1);
    assert_eq!(samples[0].key, "53672:1219");
}

#[test]
fn editing_a_sample_keeps_its_key() {
    let edited = DAY_FILE.replace("ID2=\"KOKO\"", "ID2=\"KOKO-REX\"");
    assert_eq!(split_exigo_samples(edited.as_bytes())[0].key, "53672:1219");
}

#[test]
fn a_file_without_samples_splits_into_nothing() {
    assert!(split_exigo_samples(b"<ExigoResult><Header/></ExigoResult>").is_empty());
    assert!(split_exigo_samples(b"garbage").is_empty());
}

// ---- settle check ----

#[test]
fn settle_waits_until_the_file_stops_growing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grow.xml");
    std::fs::write(&path, b"<a>").unwrap();
    let writer_path = path.clone();
    let writer = std::thread::spawn(move || {
        for _ in 0..6 {
            std::thread::sleep(Duration::from_millis(100));
            let mut f = std::fs::OpenOptions::new().append(true).open(&writer_path).unwrap();
            std::io::Write::write_all(&mut f, b"<b/>").unwrap();
        }
    });

    let started = Instant::now();
    wait_until_settled(&path, Duration::from_millis(300), Duration::from_millis(50), Duration::from_secs(5)).unwrap();
    writer.join().unwrap();

    assert!(started.elapsed() >= Duration::from_millis(800), "returned while still growing");
    assert_eq!(std::fs::read(&path).unwrap().len(), 3 + 6 * 4);
}

#[test]
fn settle_is_immediate_for_a_file_untouched_for_a_while() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("old.xml");
    write_old(&path, "<a/>");
    let started = Instant::now();
    wait_until_settled(&path, Duration::from_secs(1), Duration::from_millis(250), Duration::from_secs(15)).unwrap();
    assert!(started.elapsed() < Duration::from_millis(200));
}

#[test]
fn file_patterns_ignore_case() {
    assert!(pattern_matches("*.xml", "BM-53672.XML"));
    assert!(pattern_matches("*.xml", "bm-53672.xml"));
    assert!(!pattern_matches("*.xml", "bm-53672.txt"));
}

// ---- offering samples once ----

#[tokio::test]
async fn each_sample_in_a_day_file_is_offered_once() {
    let f = exigo_folder().await;
    let sink = RecordingSink::default();
    let path = f.file("BM-53672_2026-07-10.xml");
    write_old(&path, DAY_FILE);

    assert_eq!(process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap(), 2);
    assert_eq!(process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap(), 0);
    assert_eq!(sink.patient_ids(), vec!["KOKO", "KIRE"]);
}

/// The single-result format (`<ExigoResult>`); its `<SampleId>` tag must not
/// be mistaken for a per-day `<sample>` still being written.
const SINGLE_RESULT: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<ExigoResult>
  <Header>
    <SampleId>TEST-3376</SampleId>
    <DateTime>2026-10-23T15:42:59</DateTime>
    <DeviceType>Exigo Eos Vet</DeviceType>
  </Header>
  <Results>
    <Parameter><Code>WBC</Code><Value>12.5</Value><Unit>10^9/L</Unit><RefRange>5.5-16.9</RefRange><Flag>N</Flag></Parameter>
    <Parameter><Code>HGB</Code><Value>15.8</Value><Unit>g/dL</Unit><RefRange>12-18</RefRange><Flag>N</Flag></Parameter>
  </Results>
</ExigoResult>
"#;

#[tokio::test]
async fn a_single_result_file_is_offered_once() {
    let f = exigo_folder().await;
    let sink = RecordingSink::default();
    let path = f.file("exigo_test_TEST-3376.xml");
    write_old(&path, SINGLE_RESULT);

    assert_eq!(process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap(), 1);
    assert_eq!(process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap(), 0);
    assert_eq!(sink.patient_ids(), vec!["TEST-3376"]);
}

#[tokio::test]
async fn a_growing_day_file_offers_only_the_new_sample() {
    let f = exigo_folder().await;
    let sink = RecordingSink::default();
    let path = f.file("BM-53672_2026-07-10.xml");

    write_old(&path, &cut_inside_second_sample());
    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();
    write_old(&path, DAY_FILE);
    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();

    assert_eq!(sink.patient_ids(), vec!["KOKO", "KIRE"], "no repeat of KOKO, no skip of KIRE");
}

#[tokio::test]
async fn an_edited_sample_is_not_offered_again() {
    let f = exigo_folder().await;
    let sink = RecordingSink::default();
    let path = f.file("BM-53672_2026-07-10.xml");

    write_old(&path, &first_sample_only());
    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();
    write_old(&path, &first_sample_only().replace("ID2=\"KOKO\"", "ID2=\"KOKO-REX\""));
    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();

    assert_eq!(sink.patient_ids(), vec!["KOKO"]);
}

#[tokio::test]
async fn offered_samples_are_remembered_across_a_restart() {
    let f = exigo_folder().await;
    let path = f.file("BM-53672_2026-07-10.xml");
    write_old(&path, DAY_FILE);
    process_file(&f.ctx, &RecordingSink::default(), &path, ProcessMode::Offer).await.unwrap();

    // Same database, fresh watcher state.
    let after_restart = RecordingSink::default();
    process_file(&f.ctx, &after_restart, &path, ProcessMode::Offer).await.unwrap();
    assert!(after_restart.patient_ids().is_empty());
}

#[tokio::test]
async fn the_saved_copy_of_a_sample_holds_only_that_sample() {
    let f = exigo_folder().await;
    let sink = RecordingSink::default();
    let path = f.file("BM-53672_2026-07-10.xml");
    write_old(&path, DAY_FILE);
    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();

    let results = sink.results.lock().unwrap();
    let (payload, data) = &results[1];
    assert!(payload["fileId"].is_string());
    assert!(data.original_file_name.contains("1220"), "name tells the samples apart: {}", data.original_file_name);
    let reparsed =
        DeviceParserService::parse_device_data("exigo_eos_vet", "Exigo", "x.xml", &data.file_data, "file_watch").unwrap();
    assert_eq!(reparsed.patient_identifier.as_deref(), Some("KIRE"));
}

#[tokio::test]
async fn an_unreadable_file_is_reported_once() {
    let f = exigo_folder().await;
    let sink = RecordingSink::default();
    let path = f.file("broken.xml");
    write_old(&path, "this is not xml");

    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();
    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();

    assert!(sink.patient_ids().is_empty());
    assert_eq!(sink.events.lock().unwrap().len(), 1);
}

// ---- catch-up on start ----

#[tokio::test]
async fn first_look_at_a_folder_remembers_what_is_there_without_offering_it() {
    let f = exigo_folder().await;
    let path = f.file("BM-53672_2026-07-10.xml");
    write_old(&path, &first_sample_only());

    let sink = RecordingSink::default();
    assert_eq!(catch_up(&f.ctx, &sink).await.unwrap(), 0);
    assert!(sink.patient_ids().is_empty(), "history isn't offered as new results");

    write_old(&path, DAY_FILE);
    process_file(&f.ctx, &sink, &path, ProcessMode::Offer).await.unwrap();
    assert_eq!(sink.patient_ids(), vec!["KIRE"]);
}

// Final review (low): the "first look" lasted until the first result was
// claimed, so results written into a folder that was empty when it was set
// up (machine set up in the evening, day file before the app started) were
// remembered as old and never offered.
#[tokio::test]
async fn on_the_first_look_files_written_after_set_up_are_offered() {
    let mut f = exigo_folder().await;
    f.ctx.config.set_up_at = Some(SystemTime::now() - Duration::from_secs(3600));
    let before = f.file("before.xml");
    std::fs::write(&before, first_sample_only().replace("SEQ=\"1", "SEQ=\"8")).unwrap();
    std::fs::File::options().write(true).open(&before).unwrap()
        .set_modified(SystemTime::now() - Duration::from_secs(2 * 3600)).unwrap();
    write_old(&f.file("BM-53672_2026-07-10.xml"), DAY_FILE);

    let sink = RecordingSink::default();
    let offered = catch_up(&f.ctx, &sink).await.unwrap();

    assert!(offered >= 1, "the day file written after set-up is offered");
    assert!(sink.patient_ids().contains(&"KIRE".to_string()));
}

#[tokio::test]
async fn results_written_while_the_app_was_closed_are_offered_on_start() {
    let f = exigo_folder().await;
    let path = f.file("BM-53672_2026-07-10.xml");
    write_old(&path, &first_sample_only());
    process_file(&f.ctx, &RecordingSink::default(), &path, ProcessMode::Offer).await.unwrap();

    // App closed; the analyzer adds a sample; app starts again.
    write_old(&path, DAY_FILE);
    let sink = RecordingSink::default();
    assert_eq!(catch_up(&f.ctx, &sink).await.unwrap(), 1);
    assert_eq!(sink.patient_ids(), vec!["KIRE"]);
}

#[tokio::test]
async fn catch_up_skips_files_older_than_the_window() {
    let f = exigo_folder().await;
    let seen = f.file("today.xml");
    write_old(&seen, &first_sample_only());
    process_file(&f.ctx, &RecordingSink::default(), &seen, ProcessMode::Offer).await.unwrap();

    let ancient = f.file("last-month.xml");
    std::fs::write(&ancient, DAY_FILE.replace("SEQ=\"12", "SEQ=\"99")).unwrap();
    std::fs::File::options()
        .write(true)
        .open(&ancient)
        .unwrap()
        .set_modified(SystemTime::now() - Duration::from_secs(30 * 24 * 3600))
        .unwrap();

    let sink = RecordingSink::default();
    assert_eq!(catch_up(&f.ctx, &sink).await.unwrap(), 0);
}

// ---- watcher start / stop / lost ----

fn cfg(id: i64, dir: &str) -> WatchConfig {
    WatchConfig {
        integration_id: id,
        name: format!("Folder {id}"),
        directory: dir.to_string(),
        pattern: "*.xml".to_string(),
        device_type: "exigo_eos_vet".to_string(),
        set_up_at: None,
    }
}

fn dirs(present: &'static [&'static str], files: &'static [&'static str]) -> impl Fn(&str) -> DirState {
    move |d: &str| {
        if present.contains(&d) {
            DirState::Present
        } else if files.contains(&d) {
            DirState::NotAFolder
        } else {
            DirState::Missing
        }
    }
}

#[test]
fn a_new_folder_integration_starts_watching() {
    let actions = plan_watchers(&[cfg(1, "/lab")], &HashMap::new(), &dirs(&["/lab"], &[]));
    assert_eq!(actions, vec![WatchAction::Start(cfg(1, "/lab"))]);
}

#[test]
fn a_missing_folder_is_reported_and_retried_later() {
    let actions = plan_watchers(&[cfg(1, "/lab")], &HashMap::new(), &dirs(&[], &[]));
    assert_eq!(actions, vec![WatchAction::Unavailable(cfg(1, "/lab"), DeviceErrorKind::FolderMissing)]);

    // Next check: the share is back.
    let actions = plan_watchers(&[cfg(1, "/lab")], &HashMap::new(), &dirs(&["/lab"], &[]));
    assert_eq!(actions, vec![WatchAction::Start(cfg(1, "/lab"))]);
}

#[test]
fn a_path_that_is_a_file_is_not_a_folder() {
    let actions = plan_watchers(&[cfg(1, "/lab.xml")], &HashMap::new(), &dirs(&[], &["/lab.xml"]));
    assert_eq!(actions, vec![WatchAction::Unavailable(cfg(1, "/lab.xml"), DeviceErrorKind::NotAFolder)]);
}

#[test]
fn a_watched_folder_that_vanishes_is_lost() {
    let active = HashMap::from([(1, cfg(1, "/lab"))]);
    let actions = plan_watchers(&[cfg(1, "/lab")], &active, &dirs(&[], &[]));
    assert_eq!(actions, vec![WatchAction::Lost(cfg(1, "/lab"))]);
}

#[test]
fn a_healthy_watcher_is_left_alone() {
    let active = HashMap::from([(1, cfg(1, "/lab"))]);
    assert!(plan_watchers(&[cfg(1, "/lab")], &active, &dirs(&["/lab"], &[])).is_empty());
}

#[test]
fn a_disabled_or_deleted_integration_stops_watching() {
    let active = HashMap::from([(1, cfg(1, "/lab"))]);
    assert_eq!(plan_watchers(&[], &active, &dirs(&["/lab"], &[])), vec![WatchAction::Stop(1)]);
}

#[test]
fn a_changed_folder_restarts_the_watcher() {
    let active = HashMap::from([(1, cfg(1, "/old"))]);
    let actions = plan_watchers(&[cfg(1, "/new")], &active, &dirs(&["/old", "/new"], &[]));
    assert_eq!(actions, vec![WatchAction::Stop(1), WatchAction::Start(cfg(1, "/new"))]);
}

// ---- periodic rescan (device-health #3: events can be missed) ----

#[tokio::test]
async fn the_rescan_offers_a_new_result_no_folder_event_reported() {
    let f = exigo_folder().await;
    let path = f.file("BM-53672_2026-07-10.xml");
    write_old(&path, &first_sample_only());
    process_file(&f.ctx, &RecordingSink::default(), &path, ProcessMode::Offer).await.unwrap();

    // The analyzer adds a sample; the OS event is lost.
    write_old(&path, DAY_FILE);
    let sink = RecordingSink::default();
    assert_eq!(rescan_recent(&f.ctx, &sink).await.unwrap(), 1);
    assert_eq!(sink.patient_ids(), vec!["KIRE"]);

    // The next rescan finds nothing new.
    let again = RecordingSink::default();
    assert_eq!(rescan_recent(&f.ctx, &again).await.unwrap(), 0);
}

#[tokio::test]
async fn the_rescan_offers_a_result_in_a_folder_seen_empty_at_start() {
    let f = exigo_folder().await;
    let path = f.file("BM-53672_2026-07-10.xml");
    write_old(&path, DAY_FILE);

    let sink = RecordingSink::default();
    assert_eq!(rescan_recent(&f.ctx, &sink).await.unwrap(), 2, "a new file, not history");
}

#[tokio::test]
async fn the_rescan_leaves_files_older_than_its_window() {
    let f = exigo_folder().await;
    let old = f.file("yesterday.xml");
    std::fs::write(&old, DAY_FILE).unwrap();
    std::fs::File::options()
        .write(true)
        .open(&old)
        .unwrap()
        .set_modified(SystemTime::now() - Duration::from_secs(3600))
        .unwrap();

    let sink = RecordingSink::default();
    assert_eq!(rescan_recent(&f.ctx, &sink).await.unwrap(), 0);
}
