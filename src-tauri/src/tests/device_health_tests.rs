//! Device health: the serial read loop, reconnect counting and error kinds.

use crate::services::device_events::DeviceErrorKind;
use crate::services::device_input::{
    classify_open_error, classify_read_error, next_retry_count, run_read_loop, DeviceProtocol,
    FrameSink, ReadErrorAction, STABLE_CONNECTION,
};
use std::io::{self, ErrorKind, Read};
use std::sync::mpsc;
use std::time::{Duration, Instant};

#[derive(Default)]
struct RecordingSink {
    bytes: usize,
    frames: Vec<Vec<u8>>,
    cut_offs: Vec<Vec<u8>>,
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
