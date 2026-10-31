//! Device health: the serial read loop, reconnect counting and error kinds.

use crate::commands::device_input::{fill_connection_health, fill_watcher_health};
use crate::services::device_events::{note_bytes, note_result, DeviceErrorKind};
use crate::services::device_input::{
    classify_open_error, classify_read_error, next_retry_count, run_read_loop, run_read_loop_with_clock, run_read_loop_with_presence, ConnectionState,
    DeviceConnectionStatus, DeviceProtocol, FrameSink, ReadErrorAction, STABLE_CONNECTION,
};
use crate::services::file_watcher::{FileWatcherState, FileWatcherStatus};
use std::collections::HashMap;
use std::io::{self, ErrorKind, Read};
use std::sync::mpsc;
use std::time::{Duration, Instant};

#[derive(Default)]
struct RecordingSink {
    bytes: usize,
    frames: Vec<Vec<u8>>,
    cut_offs: Vec<Vec<u8>>,
    unrecognized: Vec<usize>,
}

impl FrameSink for RecordingSink {
    fn on_bytes(&mut self, data: &[u8]) {
        self.bytes += data.len();
    }
    fn on_frame(&mut self, frame: Vec<u8>) {
        self.frames.push(frame);
    }
    fn on_cut_off(&mut self, partial: Vec<u8>) {
        self.cut_offs.push(partial);
    }
    fn on_unrecognized(&mut self, bytes: usize) {
        self.unrecognized.push(bytes);
    }
}

/// Plays back a script of reads; once the script is used up it repeats the
/// last entry forever (like a dead port that fails every read instantly).
struct ScriptedReader {
    script: Vec<Result<Vec<u8>, fn() -> io::Error>>,
    pos: usize,
    reads: usize,
}

impl ScriptedReader {
    fn new(script: Vec<Result<Vec<u8>, fn() -> io::Error>>) -> Self {
        Self { script, pos: 0, reads: 0 }
    }
}

impl Read for ScriptedReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.reads += 1;
        let idx = self.pos.min(self.script.len() - 1);
        self.pos += 1;
        match &self.script[idx] {
            Ok(bytes) => {
                buf[..bytes.len()].copy_from_slice(bytes);
                Ok(bytes.len())
            }
            Err(make) => Err(make()),
        }
    }
}

fn pointcare() -> DeviceProtocol {
    DeviceProtocol { start_symbol: Some(0x0B), end_symbol: 0x1C, baud_rate: 115200 }
}

fn healvet() -> DeviceProtocol {
    DeviceProtocol { start_symbol: None, end_symbol: b'E', baud_rate: 9600 }
}

fn timed_out() -> io::Error {
    io::Error::new(ErrorKind::TimedOut, "Operation timed out")
}

// ---- G1: read errors ----

#[test]
fn serialport_read_timeout_means_no_data_yet() {
    assert_eq!(classify_read_error(&timed_out()), ReadErrorAction::NoData);
    assert_eq!(
        classify_read_error(&io::Error::new(ErrorKind::Interrupted, "EINTR")),
        ReadErrorAction::NoData
    );
}

#[test]
fn windows_unplug_codes_are_fatal() {
    // 22 device does not recognize the command, 31 device not functioning,
    // 1167 device not connected, 995 operation aborted (std maps it to TimedOut).
    for code in [22, 31, 1167, 995] {
        assert_eq!(
            classify_read_error(&io::Error::from_raw_os_error(code)),
            ReadErrorAction::Fatal,
            "os error {code} must stop the read loop"
        );
    }
}

#[test]
fn unknown_read_errors_are_fatal_by_default() {
    for kind in [ErrorKind::Other, ErrorKind::BrokenPipe, ErrorKind::InvalidInput, ErrorKind::NotFound] {
        assert_eq!(
            classify_read_error(&io::Error::new(kind, "boom")),
            ReadErrorAction::Fatal,
            "{kind:?} must stop the read loop"
        );
    }
}

// Serial test on the Mac: a cable pulled while a result was half sent made the
// half disappear without a trace (it is only in the raw log). It is reported
// like a result that stopped, so the lab inbox shows something was lost.
#[test]
fn a_result_cut_by_an_unplug_is_reported_not_dropped() {
    let mut half = vec![0x0B];
    half.extend_from_slice(b"MSH|^~\\&|PointCare|PID|kiki|OBX|TBIL|0.2");
    let mut reader = ScriptedReader::new(vec![Ok(half.clone()), Err(|| io::Error::from_raw_os_error(1167))]);
    let (_tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();

    let result = run_read_loop(&mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink);

    assert!(result.is_err());
    assert!(sink.frames.is_empty());
    assert_eq!(sink.cut_offs.len(), 1, "the half result must reach the lab inbox as cut off");
    assert!(sink.cut_offs[0].ends_with(b"TBIL|0.2"));
}

#[test]
fn noise_on_the_line_is_reported_and_the_result_after_it_still_read() {
    let mut frame = vec![0x0B];
    frame.extend_from_slice(b"MSH|ok");
    frame.push(0x1C);
    let mut reader = ScriptedReader::new(vec![
        Ok(vec![b'z'; 600]),
        Ok(vec![b'z'; 600]),
        Ok(frame),
        Err(|| io::Error::from_raw_os_error(1167)),
    ]);
    let (_tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();
    let _ = run_read_loop(&mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink);
    assert_eq!(sink.frames, vec![b"MSH|ok".to_vec()]);
    assert_eq!(sink.unrecognized, vec![1200], "reported once it passes a kilobyte");
}

// Clinic logs: the PointCare sends long runs of 0x00 bytes (thousands a minute)
// between results. An idle line, not garbled data.
#[test]
fn zero_bytes_between_results_are_not_reported_as_noise() {
    let mut frame = vec![0x0B];
    frame.extend_from_slice(b"MSH|ok");
    frame.push(0x1C);
    let mut script: Vec<Result<Vec<u8>, fn() -> io::Error>> = vec![Ok(vec![0x00; 500]); 8];
    script.push(Ok(frame));
    script.push(Err(|| io::Error::from_raw_os_error(1167)));
    let mut reader = ScriptedReader::new(script);
    let (_tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();
    let _ = run_read_loop(&mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink);
    assert_eq!(sink.frames, vec![b"MSH|ok".to_vec()]);
    assert!(sink.unrecognized.is_empty(), "zero bytes reported as noise: {:?}", sink.unrecognized);
}

// Windows lab: after the port's device went away the app kept "Connected",
// reading nothing forever. Some USB-serial drivers do the same on a pulled
// cable: no error, just no data. A gone port ends the connection.
#[test]
fn a_port_that_is_gone_ends_the_connection_even_without_a_read_error() {
    let mut reader = ScriptedReader::new(vec![Err(timed_out)]);
    let (tx, rx) = mpsc::channel::<()>();
    // Without the check the loop would read nothing forever; stop it after a second.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(1));
        let _ = tx.send(());
    });
    let mut sink = RecordingSink::default();
    let mut checks = 0;
    let mut present = || {
        checks += 1;
        checks < 3
    };
    let started = Instant::now();
    let result = run_read_loop_with_presence(
        &mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink, &mut present, Duration::from_millis(20),
    );
    assert!(result.is_err(), "a gone port must hand over to reconnect");
    assert_eq!(checks, 3);
    assert!(started.elapsed() < Duration::from_secs(2));
}

// Some USB-serial ports are dead after the PC wakes from sleep, yet still
// listed and giving no error. A jump in the clock means the PC slept: reopen.
#[test]
fn after_the_computer_slept_the_port_is_opened_again() {
    let mut reader = ScriptedReader::new(vec![Err(timed_out)]);
    let (tx, rx) = mpsc::channel::<()>();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(1));
        let _ = tx.send(());
    });
    let mut sink = RecordingSink::default();
    let start = std::time::SystemTime::now();
    let mut calls = 0u64;
    // Normal turns, then eight hours later.
    let mut clock = || {
        calls += 1;
        start + if calls < 5 { Duration::from_millis(10 * calls) } else { Duration::from_secs(8 * 3600) }
    };
    let result = run_read_loop_with_clock(
        &mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink, &mut || true, Duration::MAX, &mut clock,
    );
    assert!(result.is_err(), "a slept PC must reopen the port");
}

#[test]
fn read_loop_stops_on_unplug_error_instead_of_spinning() {
    let mut reader = ScriptedReader::new(vec![Err(|| io::Error::from_raw_os_error(1167))]);
    let (_tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();

    let started = Instant::now();
    let result = run_read_loop(&mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink);

    assert!(result.is_err(), "an unplug error must hand over to reconnect");
    assert_eq!(reader.reads, 1, "must not keep reading a dead port");
    assert!(started.elapsed() < Duration::from_secs(1));
}

#[test]
fn read_loop_does_not_busy_loop_on_instant_empty_reads() {
    let mut reader = ScriptedReader::new(vec![Err(timed_out)]);
    let (tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();

    let stopper = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        let _ = tx.send(());
    });
    let result = run_read_loop(&mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink);
    stopper.join().unwrap();

    assert!(result.is_ok(), "shutdown is a clean exit");
    assert!(reader.reads <= 12, "instant timeouts must be throttled, got {} reads in 300 ms", reader.reads);
}

#[test]
fn read_loop_delivers_frames_and_raw_bytes() {
    let mut frame = vec![0x0B];
    frame.extend_from_slice(b"MSH|^~");
    frame.push(0x1C);
    let mut reader = ScriptedReader::new(vec![Ok(frame), Err(|| io::Error::from_raw_os_error(31))]);
    let (_tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();

    let _ = run_read_loop(&mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink);

    assert_eq!(sink.frames, vec![b"MSH|^~".to_vec()]);
    assert_eq!(sink.bytes, 8);
}

#[test]
fn read_loop_hands_over_a_cut_off_frame() {
    let mut reader = ScriptedReader::new(vec![Ok(b"#AFS1000&partial&".to_vec()), Err(timed_out)]);
    let (tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();

    let stopper = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        let _ = tx.send(());
    });
    let _ = run_read_loop(&mut reader, &healvet(), &rx, Duration::from_millis(100), &mut sink);
    stopper.join().unwrap();

    assert_eq!(sink.cut_offs, vec![b"#AFS1000&partial&".to_vec()]);
    assert!(sink.frames.is_empty());
}

#[test]
fn read_loop_reports_a_message_cut_by_a_new_start_byte_and_delivers_the_next() {
    let mut bytes = vec![0x0B];
    bytes.extend_from_slice(b"MSH|first|OBX|TBIL|0.2");
    bytes.push(0x0B);
    bytes.extend_from_slice(b"MSH|second");
    bytes.push(0x1C);
    let mut reader = ScriptedReader::new(vec![Ok(bytes), Err(|| io::Error::from_raw_os_error(31))]);
    let (_tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();

    let _ = run_read_loop(&mut reader, &pointcare(), &rx, Duration::from_secs(5), &mut sink);

    assert_eq!(sink.frames, vec![b"MSH|second".to_vec()]);
    assert_eq!(sink.cut_offs, vec![b"MSH|first|OBX|TBIL|0.2".to_vec()]);
}

#[test]
fn read_loop_takes_a_healvet_frame_ending_in_bare_ee_once_the_line_goes_quiet() {
    let mut reader = ScriptedReader::new(vec![Ok(b"#AFS1000&S1&Serum EE".to_vec()), Err(timed_out)]);
    let (tx, rx) = mpsc::channel::<()>();
    let mut sink = RecordingSink::default();

    let stopper = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        let _ = tx.send(());
    });
    let _ = run_read_loop(&mut reader, &healvet(), &rx, Duration::from_millis(100), &mut sink);
    stopper.join().unwrap();

    assert_eq!(sink.frames, vec![b"#AFS1000&S1&Serum ".to_vec()]);
    assert!(sink.cut_offs.is_empty());
}

// ---- G2: retry counter ----

#[test]
fn retry_count_resets_after_a_stable_connection() {
    assert_eq!(next_retry_count(37, Some(STABLE_CONNECTION)), 1);
    assert_eq!(next_retry_count(6, Some(Duration::from_secs(600))), 1);
}

#[test]
fn retry_count_keeps_growing_when_the_port_never_opened() {
    assert_eq!(next_retry_count(6, None), 7);
}

#[test]
fn retry_count_keeps_growing_when_the_connection_dropped_at_once() {
    // A port that opens and fails its first read must still back off,
    // or it would retry every two seconds forever.
    assert_eq!(next_retry_count(6, Some(Duration::from_millis(50))), 7);
}

// ---- G3: last result / last byte on the status ----

fn serial_status(integration_id: i64) -> DeviceConnectionStatus {
    DeviceConnectionStatus {
        integration_id,
        port_name: "COM3".to_string(),
        device_type: "mnchip_pointcare_chemistry".to_string(),
        status: ConnectionState::Connected,
        last_connected: None,
        last_error: None,
        error_kind: None,
        retry_count: 0,
        next_retry: None,
        last_result_at: None,
        last_byte_at: None,
    }
}

fn watcher_status(integration_id: i64) -> FileWatcherStatus {
    FileWatcherStatus {
        integration_id,
        name: "Exigo".to_string(),
        watch_directory: "/x".to_string(),
        status: FileWatcherState::Watching,
        last_error: None,
        error_kind: None,
        files_processed: 0,
        last_result_at: None,
    }
}

#[test]
fn status_shows_the_stored_last_result_after_a_restart() {
    let persisted = HashMap::from([(910_001, "2026-10-23T08:42:00+00:00".to_string())]);
    let filled = fill_connection_health(vec![serial_status(910_001)], &persisted);
    assert_eq!(filled[0].last_result_at.as_deref(), Some("2026-10-23T08:42:00+00:00"));
}

#[test]
fn status_prefers_this_session_result_and_shows_last_byte() {
    note_result(910_002, "2026-10-23T10:42:00+00:00");
    note_bytes(910_002);
    let persisted = HashMap::from([(910_002, "2026-10-22T08:00:00+00:00".to_string())]);
    let filled = fill_connection_health(vec![serial_status(910_002)], &persisted);
    assert_eq!(filled[0].last_result_at.as_deref(), Some("2026-10-23T10:42:00+00:00"));
    assert!(filled[0].last_byte_at.is_some());
}

#[test]
fn folder_status_shows_the_last_result_too() {
    let persisted = HashMap::from([(910_003, "2026-10-23T09:10:00+00:00".to_string())]);
    let filled = fill_watcher_health(vec![watcher_status(910_003)], &persisted);
    assert_eq!(filled[0].last_result_at.as_deref(), Some("2026-10-23T09:10:00+00:00"));
}

#[test]
fn status_without_any_result_stays_empty() {
    let filled = fill_connection_health(vec![serial_status(910_004)], &HashMap::new());
    assert!(filled[0].last_result_at.is_none());
    assert!(filled[0].last_byte_at.is_none());
}

// ---- G8: open errors ----

#[test]
fn open_error_for_a_port_that_is_gone_is_port_missing() {
    let e = serialport::Error::new(serialport::ErrorKind::NoDevice, "The system cannot find the file specified.");
    assert_eq!(classify_open_error(&e, false), DeviceErrorKind::PortMissing);
    let e = serialport::Error::new(serialport::ErrorKind::Io(ErrorKind::NotFound), "No such file or directory");
    assert_eq!(classify_open_error(&e, false), DeviceErrorKind::PortMissing);
}

#[test]
fn open_error_for_a_present_port_means_another_program_has_it() {
    // Windows reports ACCESS_DENIED (port held by another program) as NoDevice too.
    let e = serialport::Error::new(serialport::ErrorKind::NoDevice, "Access is denied.");
    assert_eq!(classify_open_error(&e, true), DeviceErrorKind::PortBusy);
}

#[test]
fn open_error_permission_denied_is_access_denied() {
    let e = serialport::Error::new(serialport::ErrorKind::Io(ErrorKind::PermissionDenied), "Permission denied");
    assert_eq!(classify_open_error(&e, true), DeviceErrorKind::AccessDenied);
}

#[test]
fn open_error_of_another_kind_is_unknown() {
    let e = serialport::Error::new(serialport::ErrorKind::InvalidInput, "bad baud");
    assert_eq!(classify_open_error(&e, true), DeviceErrorKind::Unknown);
}

// Final review: Quit from the tray joined every listener on the main thread,
// while a listener handing over a result waited for the main thread: the app
// hung. The wait is now bounded.
#[test]
fn a_stop_that_hangs_gives_up_after_the_limit() {
    use crate::services::device_input::within;
    let started = Instant::now();
    assert_eq!(within(Duration::from_millis(200), || { std::thread::sleep(Duration::from_secs(5)); 3 }), None);
    assert!(started.elapsed() < Duration::from_secs(2));
    assert_eq!(within(Duration::from_secs(2), || 3), Some(3));
}

// Final review: some drivers leave a working port out of the port list; the
// presence check then closed it every 5 s and results sent meanwhile were lost.
#[test]
fn a_port_the_driver_never_lists_is_not_dropped_for_being_unlisted() {
    use crate::services::device_input::still_there;
    assert!(still_there(false, false), "never listed: the list says nothing about it");
    assert!(!still_there(true, false), "listed when opened, gone now");
    assert!(still_there(true, true));
}

