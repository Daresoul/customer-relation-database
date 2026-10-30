use std::collections::HashMap;
use std::process::{Command, Stdio};
#[allow(unused_imports)]
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};
use serde_json::Value;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::fs;
use std::time::Duration;
use crate::models::settings::ClinicProfile;
use crate::services::money::InvoiceTotals;

/// Longest a PDF job may run before Java is stopped.
const JAVA_TIMEOUT: Duration = Duration::from_secs(60);
const JAVA_VERSION_TIMEOUT: Duration = Duration::from_secs(15);

/// Parent of the per-job folders, inside the system temp folder.
const PDF_JOBS_DIR: &str = "arkivet-pdf-jobs";

/// A PDF job's own working folder; removed with everything in it on drop.
struct JobDir {
    path: PathBuf,
}

impl JobDir {
    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for JobDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

/// What a finished Java run printed.
struct JavaOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

/// Java PDF service - calls the iText 5 JAR for PDF generation
/// This provides 100% identical output to the original print-app
pub struct JavaPdfService;

/// Outcome of comparing the bundled JAR's build version against the running
/// app version. See `JavaPdfService::classify_jar_version`.
#[derive(Debug, PartialEq, Eq)]
enum JarVersionVerdict {
    /// Dev/unstamped build ("dev" JAR or "0.0.0" app) — no meaningful check.
    SkipDev { app: String, jar: String },
    /// JAR and app agree.
    Match { version: String },
    /// JAR was built for a different app version (stale JAR after a partial update).
    Mismatch { app: String, jar: String },
}

/// What staff are told at start about making PDFs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum PdfToolHealth {
    Ok,
    /// The PDF tool is not in this installation.
    ToolMissing,
    /// Java is not installed, so no PDF can be made.
    JavaMissing,
    /// The PDF tool is from another version (a half-applied update).
    Stale { app: String, tool: String },
    /// Something else went wrong; PDFs may still work.
    Unknown { detail: String },
}

/// The start-up check's outcome; none until it has run (it starts Java, ~0.5 s).
pub struct PdfToolState(pub std::sync::Mutex<Option<PdfToolHealth>>);

impl JavaPdfService {
    /// The start-up check's outcome from reading the tool's version.
    pub fn pdf_tool_health(read: Result<String, String>, app_version: &str) -> PdfToolHealth {
        match read {
            Ok(jar) => match Self::classify_jar_version(app_version, &jar) {
                JarVersionVerdict::Mismatch { app, jar } => PdfToolHealth::Stale { app, tool: jar },
                _ => PdfToolHealth::Ok,
            },
            Err(e) if e.contains("not found at resolved path") || e.contains("JAR not found") => PdfToolHealth::ToolMissing,
            Err(e) if e.contains("Failed to execute Java") => PdfToolHealth::JavaMissing,
            Err(detail) => PdfToolHealth::Unknown { detail },
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct JavaPdfInput {
    patient: JavaPatient,
    samples: Vec<JavaSample>,
    output_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct JavaPatient {
    name: String,
    owner: String,
    species: String,
    microchip_id: Option<String>,
    gender: String,
    date_of_birth: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JavaSample {
    device_type: String,
    sample_id: String,
    patient_id: String,
    detected_at: String,
    /// Local wall-clock time of the test, ISO `yyyy-MM-ddTHH:mm:ss`, no offset.
    analysis_datetime: String,
    test_results: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    test_type: Option<String>,
    /// PointCare's OBR-15 ("Whole blood"); the JAR prints serum without it.
    #[serde(skip_serializing_if = "Option::is_none")]
    sample_type: Option<String>,
}

impl JavaPdfService {
    /// Generate a PDF using the Java JAR (iText 5) with multiple device samples
    pub fn generate_pdf_multi(
        app_handle: &tauri::AppHandle,
        output_path: &str,
        patient: &crate::services::device_pdf_service::PatientData,
        device_data_list: &[crate::services::device_pdf_service::DeviceTestData],
    ) -> Result<(), String> {
        let jar_path = Self::get_jar_path(app_handle)?;
        Self::generate_pdf_multi_with_jar(&jar_path, output_path, patient, device_data_list)
    }

    /// `generate_pdf_multi` with the JAR already located.
    pub fn generate_pdf_multi_with_jar(
        jar_path: &Path,
        output_path: &str,
        patient: &crate::services::device_pdf_service::PatientData,
        device_data_list: &[crate::services::device_pdf_service::DeviceTestData],
    ) -> Result<(), String> {
        Self::generate_pdf_multi_with_clinic(jar_path, output_path, patient, device_data_list, None).map(|_| ())
    }

    /// `generate_pdf_multi_with_jar` with the clinic profile for the
    /// letterhead; without one the current letterhead is used. Returns the
    /// analyte codes that have no row on the report.
    pub fn generate_pdf_multi_with_clinic(
        jar_path: &Path,
        output_path: &str,
        patient: &crate::services::device_pdf_service::PatientData,
        device_data_list: &[crate::services::device_pdf_service::DeviceTestData],
        clinic: Option<&ClinicProfile>,
    ) -> Result<Vec<String>, String> {
        log::info!("☕ Generating PDF using Java JAR (iText 5) with {} samples...", device_data_list.len());

        // A sample with no test results must never reach the renderer: Java
        // finds none of its analyte keys and emits a report with a header-only
        // table that looks complete (clinic incident 2026-07-22 — a recent-files
        // re-add carried `null` results into an Exigo report). Same philosophy
        // as the parser's zero-yield-is-an-error rule: fail loudly, visibly,
        // and diagnosably instead of producing a silently empty medical report.
        Self::reject_empty_samples(device_data_list)?;

        let java_input = Self::build_java_input(patient, device_data_list, output_path, &chrono::Local);

        log::debug!("   🔍 DEBUG - Samples being sent to Java:");
        for (idx, sample) in java_input.samples.iter().enumerate() {
            log::debug!("   Sample #{} ({}): {} test results", idx + 1, sample.device_type, sample.test_results.len());
            for (key, value) in &sample.test_results {
                log::debug!("      {} = {}", key, value);
            }
        }

        let input = serde_json::to_value(&java_input)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
        let input = Self::attach_clinic(input, clinic);
        let stderr = Self::run_jar_job(jar_path, input, output_path, JAVA_TIMEOUT)?;

        log::info!("✅ Java PDF generated successfully");
        Ok(Self::unmapped_codes(&stderr))
    }

    /// Builds the JSON contract sent to the JAR. Pure (no I/O), so the
    /// Rust side of the Rust/Java contract is unit-testable.
    pub(crate) fn build_java_input<Tz: chrono::TimeZone>(
        patient: &crate::services::device_pdf_service::PatientData,
        device_data_list: &[crate::services::device_pdf_service::DeviceTestData],
        output_path: &str,
        tz: &Tz,
    ) -> JavaPdfInput {
        // Sort samples in the order Java expects: Exigo, Pointcare, Healvet, PCR
        // PCR samples go last as they are rendered on separate pages
        // This is critical for correct PDF layout (Java PDF code line 273)
        let mut sorted_samples = device_data_list.to_vec();
        sorted_samples.sort_by_key(|device| {
            match device.device_type.as_str() {
                "exigo_eos_vet" => 0,              // Exigo first
                "mnchip_pointcare_chemistry" => 1, // Pointcare chemistry second
                "healvet_hv_fia_3000" => 2,        // Healvet third
                "mnchip_pcr_analyzer" | "mnchip_pointcare_pcr_v1" => 3, // PCR last (separate page)
                _ => 99,                            // Unknown devices last
            }
        });

        log::debug!("   📋 Sorted samples order:");
        for (i, device) in sorted_samples.iter().enumerate() {
            log::debug!("      {}. {} ({})", i + 1, device.device_name, device.device_type);
        }

        // Convert all device data to Java samples
        let java_samples: Vec<JavaSample> = sorted_samples.iter().map(|device_data| {
            let test_results = Self::value_to_hashmap(&device_data.test_results);

            let sample_id = Self::sample_number(&device_data.device_type, &device_data.test_results);

            let patient_id = device_data.patient_identifier
                .clone()
                .unwrap_or_else(|| "N/A".to_string());

            let java_device_type = Self::map_device_type(&device_data.device_type);
            let sample_type = (java_device_type == "pointcare")
                .then(|| test_results.get("sample_type").cloned())
                .flatten()
                .filter(|s| !s.trim().is_empty());

            JavaSample {
                device_type: java_device_type,
                sample_id,
                patient_id,
                detected_at: device_data.detected_at.to_rfc3339(),
                analysis_datetime: Self::analysis_datetime(device_data, tz),
                sample_type,
                test_results,
                test_type: None,
            }
        }).collect();

        // Create Java patient
        let java_patient = JavaPatient {
            name: patient.name.clone(),
            owner: patient.owner.clone(),
            species: patient.species.clone(),
            microchip_id: patient.microchip_id.clone(),
            gender: patient.gender.clone(),
            date_of_birth: patient.date_of_birth.as_deref().and_then(Self::iso_date_of_birth),
        };

        JavaPdfInput {
            patient: java_patient,
            samples: java_samples,
            output_path: output_path.to_string(),
        }
    }

    /// Date of birth as the JAR expects it (`yyyy-MM-dd`), whatever shape the
    /// database row or a typed override holds; None when it can't be read.
    fn iso_date_of_birth(raw: &str) -> Option<String> {
        let raw = raw.trim();
        if raw.is_empty() {
            return None;
        }
        let date_part = raw.split(|c| c == 'T' || c == ' ').next().unwrap_or(raw);
        for format in ["%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y"] {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, format) {
                return Some(date.format("%Y-%m-%d").to_string());
            }
        }
        log::warn!("Date of birth {:?} is not a recognised date; sending none to the PDF", raw);
        None
    }

    /// The analyzer's own run time, read from the keys each parser keeps
    /// (Exigo `DATE`/`DateTime`, HL7 OBR-7 `test_datetime` then MSH-7
    /// `message_datetime`, Healvet `test_datetime`). Device clocks are local
    /// wall time, so they pass through unconverted. Without one, the receive
    /// instant is converted to `tz`.
    fn analysis_datetime<Tz: chrono::TimeZone>(
        device_data: &crate::services::device_pdf_service::DeviceTestData,
        tz: &Tz,
    ) -> String {
        Self::device_time(&device_data.test_results)
            .unwrap_or_else(|| device_data.detected_at.with_timezone(tz).naive_local())
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    }

    /// The analyzer's own run time (local wall time), when the result has one.
    pub fn device_time(test_results: &serde_json::Value) -> Option<chrono::NaiveDateTime> {
        const DEVICE_TIME_KEYS: [&str; 4] = ["DATE", "DateTime", "test_datetime", "message_datetime"];
        const DEVICE_TIME_FORMATS: [&str; 6] = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y%m%d%H%M%S",
            "%d-%m-%Y %H:%M:%S",
            "%d.%m.%Y %H:%M:%S",
            "%Y/%m/%d %H:%M:%S",
        ];
        DEVICE_TIME_KEYS
            .iter()
            .filter_map(|k| test_results.get(*k).and_then(|v| v.as_str()))
            .find_map(|raw| {
                DEVICE_TIME_FORMATS
                    .iter()
                    .find_map(|f| chrono::NaiveDateTime::parse_from_str(raw.trim(), f).ok())
            })
    }

    /// Create a Java command configured to prevent macOS focus-stealing.
    /// Sets headless mode flags, redirects stdin to null, and on macOS
    /// creates a new process group to isolate the child process.
    /// Every Java invocation goes through here.
    fn create_java_command(jar_path: &Path, args: &[&OsStr]) -> Command {
        let mut cmd = Command::new("java");
        cmd.arg("-Djava.awt.headless=true")
            .arg("-Dapple.awt.UIElement=true")
            .arg("-Djava.awt.GraphicsEnvironment=sun.java2d.HeadlessGraphicsEnvironment")
            .arg("-jar")
            .arg(jar_path)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // On macOS/Linux, create a new process group so the child
        // doesn't inherit the parent's window session
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        // On Windows, prevent a console window from flashing
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd
    }

    /// A fresh folder for one PDF job, so concurrent jobs never share files.
    fn new_job_dir() -> Result<JobDir, String> {
        let path = std::env::temp_dir()
            .join(PDF_JOBS_DIR)
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create PDF job folder {:?}: {}", path, e))?;
        Ok(JobDir { path })
    }

    /// Run a command, reading stdout and stderr as it goes (a full pipe would
    /// stall the child), and stop it once `timeout` has passed.
    fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Result<JavaOutput, String> {
        use std::io::Read;

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to execute Java: {}", e))?;
        let drain = |pipe: Option<Box<dyn Read + Send>>| {
            std::thread::spawn(move || {
                let mut buf = Vec::new();
                if let Some(mut p) = pipe {
                    let _ = p.read_to_end(&mut buf);
                }
                String::from_utf8_lossy(&buf).to_string()
            })
        };
        let stdout = drain(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
        let stderr = drain(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));

        let deadline = std::time::Instant::now() + timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if std::time::Instant::now() >= deadline => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let stderr = stderr.join().unwrap_or_default();
                    return Err(format!(
                        "Java PDF generator timed out after {}s and was stopped. STDERR: {}",
                        timeout.as_secs_f32(),
                        stderr
                    ));
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(25)),
                Err(e) => return Err(format!("Failed to wait for Java: {}", e)),
            }
        };
        Ok(JavaOutput {
            success: status.success(),
            stdout: stdout.join().unwrap_or_default(),
            stderr: stderr.join().unwrap_or_default(),
        })
    }

    /// One JAR run in its own job folder: Java writes the PDF there, and only
    /// a finished, non-empty PDF is moved to `output_path`. Java's stderr is
    /// logged even when it succeeds, so its warnings reach the log, and
    /// returned so callers can read its `PDF_WARN` lines.
    pub(crate) fn run_jar_job(
        jar_path: &Path,
        mut input: Value,
        output_path: &str,
        timeout: Duration,
    ) -> Result<String, String> {
        let job_dir = Self::new_job_dir()?;
        let input_json_path = job_dir.path().join("input.json");
        let job_pdf = job_dir.path().join("out.pdf");
        input = Self::attach_clinic(input, Self::current_letterhead().as_ref());
        input["output_path"] = Value::String(job_pdf.to_string_lossy().to_string());
        let json_str = serde_json::to_string_pretty(&input)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
        fs::write(&input_json_path, json_str)
            .map_err(|e| format!("Failed to write temp JSON file: {}", e))?;

        log::info!("   ☕ JAR path: {:?}", jar_path);
        log::info!("   📂 Output path: {}", output_path);

        let output = Self::run_with_timeout(
            Self::create_java_command(jar_path, &[input_json_path.as_os_str()]),
            timeout,
        )?;

        if !output.success {
            return Err(Self::jar_failure_message(&output.stdout, &output.stderr));
        }
        log::info!("   ✅ Java output: {}", output.stdout);
        for warning in Self::pdf_warnings(&output.stderr) {
            crate::services::telemetry::event(
                log::Level::Warn,
                "pdf",
                "The PDF generator could not print a value as sent",
                serde_json::json!({ "warning": warning }),
            );
        }
        for line in output.stderr.lines().filter(|l| !l.trim().is_empty() && !l.trim().starts_with("PDF_WARN")) {
            log::warn!("   ☕ Java stderr: {}", line);
        }

        match fs::read(&job_pdf) {
            Ok(bytes) if Self::pdf_is_complete(&bytes) => {}
            Ok(_) => return Err("The PDF generator wrote an incomplete PDF".to_string()),
            Err(_) => return Err(format!("PDF was not created at: {}", output_path)),
        }
        let dest = Path::new(output_path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create folder for {}: {}", output_path, e))?;
        }
        if fs::rename(&job_pdf, dest).is_err() {
            Self::copy_into_place(&job_pdf, dest)?;
        }
        Ok(output.stderr)
    }

    /// A failed run's error. Its first line is the cause (the CLI's "Error
    /// generating PDF" line, else Java's first message), so the record page's
    /// warning shows why; the full output follows.
    pub(crate) fn jar_failure_message(stdout: &str, stderr: &str) -> String {
        let lines = || stderr.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with("PDF_WARN"));
        let cause = lines()
            .find(|l| l.starts_with("Error generating PDF:"))
            .or_else(|| lines().next())
            .or_else(|| stdout.lines().map(str::trim).find(|l| !l.is_empty()))
            .unwrap_or("The PDF generator stopped without saying why");
        format!("{}\nJava JAR failed.\nSTDOUT: {}\nSTDERR: {}", cause, stdout, stderr)
    }

    /// The JAR's `PDF_WARN ...` lines (a value it could not print as sent).
    pub(crate) fn pdf_warnings(stderr: &str) -> Vec<&str> {
        stderr.lines().map(str::trim).filter(|l| l.starts_with("PDF_WARN")).collect()
    }

    /// A PDF the JAR finished: it ends with the `%%EOF` marker.
    pub(crate) fn pdf_is_complete(bytes: &[u8]) -> bool {
        let tail = &bytes[bytes.len().saturating_sub(1024)..];
        tail.windows(5).any(|w| w == b"%%EOF")
    }

    /// Copy `src` next to `dest` as `<dest>.part`, then rename it over
    /// `dest`, so `dest` is never a half-written file.
    pub(crate) fn copy_into_place(src: &Path, dest: &Path) -> Result<(), String> {
        let mut part = dest.as_os_str().to_owned();
        part.push(".part");
        let part = PathBuf::from(part);
        let result = fs::copy(src, &part)
            .map_err(|e| format!("Failed to copy the PDF into place: {}", e))
            .and_then(|_| fs::rename(&part, dest).map_err(|e| format!("Failed to move the PDF into place: {}", e)));
        if result.is_err() {
            let _ = fs::remove_file(&part);
        }
        result
    }

    /// Ask the bundled JAR which app version it was built for (`java -jar … --version`,
    /// printing the manifest's Implementation-Version). Returns the trimmed string,
    /// or an Err if the JAR can't be located or Java can't run it.
    fn read_jar_version(app_handle: &tauri::AppHandle) -> Result<String, String> {
        let jar_path = Self::get_jar_path(app_handle)?;
        let output = Self::run_with_timeout(
            Self::create_java_command(&jar_path, &[OsStr::new("--version")]),
            JAVA_VERSION_TIMEOUT,
        )
        .map_err(|e| format!("Failed to run JAR --version: {}", e))?;
        if !output.success {
            return Err(format!("JAR --version exited non-zero: {}", output.stderr));
        }
        Ok(output.stdout.trim().to_string())
    }

    /// Verify the bundled PDF-generator JAR was built for the same app version
    /// that's running. Guards against a partially-applied update (app binary
    /// updated, resources/pdf-generator.jar left stale) silently rendering
    /// medical documents with outdated code — observed at the clinic in July
    /// 2026, where a 0.7.2 app kept emitting 0.7.0 PDFs (wrong unit labels) for
    /// days because the JAR was never replaced.
    ///
    /// On a real mismatch this emits an ERROR telemetry event (shipped to Loki)
    /// and logs locally. It is intentionally a warning, not a hard failure: the
    /// app still generates PDFs (an out-of-date renderer beats none), but the
    /// mismatch is now loudly visible instead of silent. Dev sentinels ("dev"
    /// JAR, "0.0.0" app) are skipped so local runs stay quiet.
    pub fn verify_jar_version(app_handle: &tauri::AppHandle) -> PdfToolHealth {
        let app_version = app_handle.package_info().version.to_string();
        let read = Self::read_jar_version(app_handle);
        let health = Self::pdf_tool_health(read.clone(), &app_version);
        let jar_version = match read {
            Ok(v) => v,
            Err(e) => {
                // Can't read the JAR version at all — told to staff at start
                // (`get_pdf_tool_health`); startup isn't blocked.
                log::warn!("⚠️  Could not read PDF generator JAR version: {}", e);
                return health;
            }
        };

        match Self::classify_jar_version(&app_version, &jar_version) {
            JarVersionVerdict::SkipDev { app, jar } => {
                log::debug!(
                    "PDF JAR version check skipped (dev build): app={}, jar={}",
                    app,
                    jar
                );
            }
            JarVersionVerdict::Match { version } => {
                log::info!("✅ PDF generator JAR version matches app: {}", version);
            }
            JarVersionVerdict::Mismatch { app, jar } => {
                // Real mismatch: the JAR on disk was built for a different app
                // version — the stale-JAR signature from the July 2026 clinic
                // incident (0.7.2 app still emitting 0.7.0 PDFs with wrong unit
                // labels). A warning, not a hard failure: the app still renders
                // PDFs (an out-of-date renderer beats none), but the mismatch is
                // now loud instead of silent.
                log::error!(
                    "❌ PDF generator JAR version mismatch: app={}, jar={} — a stale JAR \
                     will render PDFs with outdated code (e.g. wrong unit labels). \
                     Reinstall to replace resources/pdf-generator.jar.",
                    app,
                    jar
                );
                crate::services::telemetry::event(
                    log::Level::Error,
                    "pdf_generator",
                    "PDF generator JAR version does not match app version (stale JAR after partial update)",
                    serde_json::json!({
                        "failure": "jar_version_mismatch",
                        "app_version": app,
                        "jar_version": jar,
                    }),
                );
            }
        }
        health
    }

    /// Pure decision for the JAR-vs-app version check (no I/O, so it's unit
    /// testable). Normalizes both versions (trim, drop a leading `v`) and:
    ///   - skips dev/unstamped builds ("dev" JAR or "0.0.0" app), where a
    ///     mismatch is expected and would only be noise;
    ///   - reports Match when the normalized versions are equal;
    ///   - reports Mismatch otherwise — the stale-JAR case worth alerting on.
    fn classify_jar_version(app_version: &str, jar_version: &str) -> JarVersionVerdict {
        let norm = |s: &str| s.trim().trim_start_matches('v').to_string();
        let app = norm(app_version);
        let jar = norm(jar_version);

        if jar == "dev" || app == "0.0.0" {
            JarVersionVerdict::SkipDev { app, jar }
        } else if app == jar {
            JarVersionVerdict::Match { version: app }
        } else {
            JarVersionVerdict::Mismatch { app, jar }
        }
    }

    /// PDF tools in the resources folder left by earlier versions.
    pub(crate) fn stale_tool_files(names: &[String], app_version: &str) -> Vec<String> {
        if app_version == "0.0.0" {
            return Vec::new();
        }
        let current = format!("pdf-generator-{app_version}.jar");
        names
            .iter()
            .filter(|n| {
                let versioned = n
                    .strip_prefix("pdf-generator-")
                    .and_then(|r| r.strip_suffix(".jar"))
                    .is_some_and(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_digit() || c == '.'));
                (versioned || n.as_str() == "pdf-generator.jar") && **n != current
            })
            .cloned()
            .collect()
    }

    /// Deletes earlier versions' PDF tools next to the current one. Called only
    /// after the current tool checked out; a file still in use stays until the
    /// next start.
    pub fn remove_stale_tools(app_handle: &tauri::AppHandle) {
        let Ok(jar) = Self::get_jar_path(app_handle) else { return };
        let Some(dir) = jar.parent() else { return };
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        let names: Vec<String> = entries.flatten().filter_map(|e| e.file_name().into_string().ok()).collect();
        let version = app_handle.package_info().version.to_string();
        for name in Self::stale_tool_files(&names, &version) {
            match std::fs::remove_file(dir.join(&name)) {
                Ok(()) => log::info!("Removed old PDF tool {name}"),
                Err(e) => log::warn!("Could not remove old PDF tool {name}: {e}"),
            }
        }
    }

    /// Resource path of the bundled JAR for a given app version. Real releases
    /// ship `pdf-generator-<version>.jar` (per-version filename so a failed
    /// update can't leave a silently-used stale JAR); untagged dev/E2E builds
    /// (version "0.0.0") ship the legacy fixed `pdf-generator.jar`.
    fn jar_resource_name(version: &str) -> String {
        if version == "0.0.0" {
            "resources/pdf-generator.jar".to_string()
        } else {
            format!("resources/pdf-generator-{}.jar", version)
        }
    }

    /// Get the path to the JAR file
    /// In development: uses relative path to pdf-generator-cli build output
    /// In production: uses Tauri's resource resolver to locate bundled resources
    pub(crate) fn get_jar_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        // In development mode: use relative path to project
        if cfg!(debug_assertions) {
            // Try relative path from src-tauri directory
            let dev_jar = PathBuf::from("../pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar");
            if dev_jar.exists() {
                log::debug!("   🔧 Using development JAR: {:?}", dev_jar);
                return Ok(dev_jar);
            }

            // Hardcoded fallback for development
            let fallback = PathBuf::from("/Users/tomato/git/customer-relation-database/pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar");
            if fallback.exists() {
                log::debug!("   🔧 Using fallback JAR: {:?}", fallback);
                return Ok(fallback);
            }

            return Err("Development JAR not found at pdf-generator-cli/build/libs/".to_string());
        }

        // In production mode: use Tauri's resource resolver
        // This automatically handles platform-specific resource locations:
        // - macOS: Contents/Resources/
        // - Windows: resources/ (handled by Tauri internally)
        // - Linux: resources/
        //
        // The JAR is bundled under a VERSION-STAMPED name
        // (`pdf-generator-<version>.jar`) and we resolve exactly the name matching
        // this app's version. This is deliberate: a Windows installer update can
        // fail to overwrite a fixed-name resource (MSI skips "modified" unversioned
        // files; a file locked by a running java.exe can't be replaced), which used
        // to leave a stale JAR that silently rendered PDFs with outdated code
        // (July 2026 clinic incident — 0.7.2 app, 0.7.0 JAR, wrong unit labels). A
        // per-version filename turns that into a NEW file each release (always
        // installed, never a locked-overwrite), and if the matching file is absent
        // we fail loudly here rather than fall back to a stale one.
        //
        // Untagged builds (dev/E2E) report version "0.0.0" and ship the JAR under
        // the legacy fixed name, so they keep resolving `pdf-generator.jar`.
        let version = app_handle.package_info().version.to_string();
        let jar_resource = Self::jar_resource_name(&version);

        let resource_path = app_handle
            .path_resolver()
            .resolve_resource(&jar_resource)
            .ok_or_else(|| {
                format!(
                    "Could not resolve {} resource path. A version-matched JAR must be \
                     bundled in src-tauri/resources/ — a missing one usually means an \
                     update did not replace it (reinstall to fix).",
                    jar_resource
                )
            })?;

        // On Windows, resolve_resource returns UNC paths (\\?\C:\...) which Java doesn't support
        // Use dunce to convert UNC paths to normal Windows paths (C:\...)
        #[cfg(windows)]
        let normalized_path = dunce::simplified(&resource_path).to_path_buf();

        // On other platforms, use the path as-is
        #[cfg(not(windows))]
        let normalized_path = resource_path;

        if !normalized_path.exists() {
            return Err(format!(
                "{} not found at resolved path: {:?}. A missing version-matched JAR \
                 usually means an update did not replace it — reinstall to fix.",
                jar_resource, normalized_path
            ));
        }

        log::info!("   📦 Using production JAR: {:?}", normalized_path);
        Ok(normalized_path)
    }

    /// Convert JSON Value to HashMap<String, String>
    /// Refuse to render any device sample whose test results are missing or
    /// empty (`null`, `{}`, or a non-object). Emits a telemetry event naming
    /// the offending device so the failure is visible in Grafana, then errors
    /// — callers surface it to the user (regenerate) or log it while keeping
    /// the medical record (create).
    fn reject_empty_samples(
        device_data_list: &[crate::services::device_pdf_service::DeviceTestData],
    ) -> Result<(), String> {
        let empty: Vec<&str> = device_data_list
            .iter()
            .filter(|d| Self::value_to_hashmap(&d.test_results).is_empty())
            .map(|d| d.device_type.as_str())
            .collect();
        if empty.is_empty() {
            return Ok(());
        }
        crate::services::telemetry::event(
            log::Level::Error,
            "pdf_generator",
            "Device sample(s) with no test results reached PDF generation — refusing to render an empty table",
            serde_json::json!({
                "empty_device_types": empty,
                "sample_count": device_data_list.len(),
            }),
        );
        Err(format!(
            "Device sample(s) {:?} carry no test results — refusing to render a report with an empty table. \
             Re-add the device file or reimport it.",
            empty
        ))
    }

    fn value_to_hashmap(value: &Value) -> HashMap<String, String> {
        if let Some(obj) = value.as_object() {
            obj.iter()
                .map(|(k, v)| {
                    let value_str = match v {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => v.to_string(),
                    };
                    (k.clone(), value_str)
                })
                .collect()
        } else {
            HashMap::new()
        }
    }

    /// The sample number printed on a lab report.
    /// Exigo's SNO is the analyzer's serial, the same on every sample of the
    /// day; its run number is SEQ.
    pub(crate) fn sample_number(device_type: &str, test_results: &serde_json::Value) -> String {
        let run_number = (device_type == "exigo_eos_vet")
            .then(|| test_results.get("SEQ"))
            .flatten()
            .filter(|v| v.as_str().is_some_and(|s| !s.is_empty()));
        run_number
            .or_else(|| test_results.get("SNO"))
            .or_else(|| test_results.get("ID1"))
            .or_else(|| test_results.get("sample_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("AUTO-GEN")
            .to_string()
    }

    /// The analyte codes the JAR said have no row on the report
    /// (`PDF_WARN code=unmapped_analytes ... codes=A,B`).
    pub fn unmapped_codes(stderr: &str) -> Vec<String> {
        let mut codes: Vec<String> = stderr
            .lines()
            .filter(|l| l.starts_with("PDF_WARN code=unmapped_analytes"))
            .filter_map(|l| l.split_once(" codes=").map(|(_, c)| c.trim()))
            .flat_map(|c| c.split(',').map(str::trim).filter(|s| !s.is_empty()).map(String::from))
            .collect();
        codes.sort();
        codes.dedup();
        codes
    }

    /// Map detailed device type names to Java-expected format
    /// Java expects: "exigo_eos_vet", "healvet", "pointcare", or "pcr"
    /// We use: "exigo_eos_vet", "healvet_hv_fia_3000", "mnchip_pointcare_chemistry", "mnchip_pcr_analyzer"
    pub(crate) fn map_device_type(device_type: &str) -> String {
        match device_type {
            "healvet_hv_fia_3000" => "healvet".to_string(),
            "mnchip_pointcare_chemistry" => "pointcare".to_string(),
            "mnchip_pcr_analyzer" | "mnchip_pointcare_pcr_v1" => "pcr".to_string(),
            "exigo_eos_vet" => "exigo_eos_vet".to_string(),
            _ => device_type.to_string(), // Pass through unknown types
        }
    }

    /// Generate a simple PDF report using the template (Rapport.pdf)
    /// This creates a report with title and description overlaid on the clinic letterhead
    /// The JSON job for a record's report; `date` (dd/MM/yyyy) is the visit's.
    pub fn simple_report_json(
        title: &str,
        description: &str,
        patient_data: Option<&crate::services::device_pdf_service::PatientData>,
        date: Option<&str>,
        clinic: &ClinicProfile,
    ) -> Value {
        let mut json_obj = serde_json::json!({
            "report_type": "simple",
            "title": title,
            "description": description,
            "date": date,
            "clinic": Self::clinic_json(clinic),
        });
        if let Some(patient) = patient_data {
            json_obj["patient"] = serde_json::json!({
                "name": patient.name,
                "owner": patient.owner,
                "species": patient.species,
                "microchip_id": patient.microchip_id,
                "gender": patient.gender,
                "date_of_birth": patient.date_of_birth
            });
        }
        json_obj
    }

    pub fn pharmacy_note_json(prescription_text: &str, clinic: &ClinicProfile) -> Value {
        serde_json::json!({
            "report_type": "pharmacy_note",
            "prescription_text": prescription_text,
            "clinic": Self::clinic_json(clinic),
        })
    }

    /// Render a prepared JSON job (report, pharmacy note, invoice) to `output_path`.
    pub fn generate_from_job(jar_path: &Path, output_path: &str, job: Value) -> Result<(), String> {
        Self::run_jar_job(jar_path, job, output_path, JAVA_TIMEOUT).map(|_| ())
    }

}

/// The clinic profile for jobs whose caller has no database at hand (lab
/// reports made from a command). Kept current by the clinic profile commands.
static LETTERHEAD: std::sync::RwLock<Option<ClinicProfile>> = std::sync::RwLock::new(None);

impl JavaPdfService {
    /// The `clinic` object of a job: the profile's letterhead fields, null
    /// where blank (Java then keeps the template's own text).
    pub fn clinic_json(clinic: &ClinicProfile) -> Value {
        serde_json::json!({
            "name": clinic.name,
            "address": clinic.address,
            "city": clinic.city,
            "phone": clinic.phone,
            "email": clinic.email,
            "tax_number": clinic.tax_number,
            "registration_number": clinic.registration_number,
            "bank_account": clinic.bank_account,
            "bank_name": clinic.bank_name,
            "logo_path": clinic.logo_path,
        })
    }

    /// Adds `clinic` to a job that has none.
    pub fn attach_clinic(mut input: Value, clinic: Option<&ClinicProfile>) -> Value {
        if let (Some(clinic), Some(obj)) = (clinic, input.as_object_mut()) {
            obj.entry("clinic").or_insert_with(|| Self::clinic_json(clinic));
        }
        input
    }

    /// The profile used for jobs sent without one.
    pub fn set_letterhead(clinic: Option<ClinicProfile>) {
        if let Ok(mut current) = LETTERHEAD.write() {
            *current = clinic;
        }
    }

    fn current_letterhead() -> Option<ClinicProfile> {
        LETTERHEAD.read().ok().and_then(|c| c.clone())
    }

    /// The invoice job: lines with their VAT rate, and the totals worked out
    /// by `services::money`, which Java prints as they are.
    #[allow(clippy::too_many_arguments)]
    pub fn invoice_json(
        date: &str,
        invoice_number: &str,
        recipient: &str,
        line_items: &[crate::models::MedicalRecordLineItem],
        discount_percent: f64,
        currency: &str,
        totals: &InvoiceTotals,
        clinic: &ClinicProfile,
    ) -> Value {
        let items: Vec<Value> = line_items
            .iter()
            .map(|item| {
                serde_json::json!({
                    "name": item.name,
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "vat_label": item.vat_name,
                    "vat_percent": item.vat_percent,
                })
            })
            .collect();
        let groups: Vec<Value> = totals
            .vat_groups
            .iter()
            .map(|g| {
                serde_json::json!({
                    "label": g.label,
                    "percent": g.percent,
                    "net": g.net,
                    "vat": g.vat,
                    "gross": g.gross,
                })
            })
            .collect();
        serde_json::json!({
            "report_type": "invoice",
            "date": date,
            "invoice_number": invoice_number,
            "recipient": recipient,
            "line_items": items,
            "discount_percent": discount_percent,
            "currency": currency,
            "totals": {
                "subtotal": totals.subtotal,
                "discount_amount": totals.discount_amount,
                "total": totals.total,
                "vat_total": totals.vat_total,
                "prices_include_vat": totals.prices_include_vat,
                "vat_groups": groups,
            },
            "clinic": Self::clinic_json(clinic),
        })
    }
}

#[cfg(test)]
mod tests {
    // F3: a missing PDF tool or Java was only in the log; staff found out
    // when a PDF failed during a save.
    #[test]
    fn the_start_up_check_names_why_pdfs_cannot_be_made() {
        use super::{JavaPdfService as J, PdfToolHealth as H};
        assert_eq!(J::pdf_tool_health(Ok("0.8.0".into()), "0.8.0"), H::Ok);
        assert_eq!(J::pdf_tool_health(Ok("dev".into()), "0.8.0"), H::Ok);
        assert_eq!(
            J::pdf_tool_health(Ok("0.7.0".into()), "0.8.0"),
            H::Stale { app: "0.8.0".into(), tool: "0.7.0".into() }
        );
        assert_eq!(
            J::pdf_tool_health(Err("pdf-generator-0.8.0.jar not found at resolved path: \"C:/x\"".into()), "0.8.0"),
            H::ToolMissing
        );
        assert_eq!(
            J::pdf_tool_health(Err("Failed to run JAR --version: Failed to execute Java: program not found".into()), "0.8.0"),
            H::JavaMissing
        );
        assert!(matches!(J::pdf_tool_health(Err("disk on fire".into()), "0.8.0"), H::Unknown { .. }));
    }

    use super::*;

    fn sample(device_type: &str, test_results: serde_json::Value) -> crate::services::device_pdf_service::DeviceTestData {
        crate::services::device_pdf_service::DeviceTestData {
            device_type: device_type.to_string(),
            device_name: device_type.to_string(),
            test_results,
            detected_at: chrono::Utc::now(),
            patient_identifier: None,
        }
    }

    // The 2026-07-22 clinic incident: a recent-files re-add carried `null`
    // test results into PDF generation and produced a header-only hematology
    // table. Empty samples must be rejected before Java ever runs.
    #[test]
    fn empty_samples_are_rejected() {
        for empty in [serde_json::Value::Null, serde_json::json!({})] {
            let err = JavaPdfService::reject_empty_samples(&[sample("exigo_eos_vet", empty)])
                .expect_err("empty test_results must be rejected");
            assert!(err.contains("exigo_eos_vet"), "error should name the device: {}", err);
        }
    }

    #[test]
    fn one_empty_sample_rejects_the_whole_report() {
        // A report must never silently miss one of its tables — a batch with
        // any empty sample fails as a whole rather than rendering partially.
        let result = JavaPdfService::reject_empty_samples(&[
            sample("mnchip_pointcare_chemistry", serde_json::json!({"ALT": "45"})),
            sample("exigo_eos_vet", serde_json::json!({})),
        ]);
        assert!(result.is_err());
    }

    #[test]
    fn populated_samples_pass() {
        JavaPdfService::reject_empty_samples(&[
            sample("exigo_eos_vet", serde_json::json!({"WBC": "10.4", "HGB": "17.4"})),
        ])
        .expect("non-empty samples must pass");
    }

    fn patient_with_dob(dob: Option<&str>) -> crate::services::device_pdf_service::PatientData {
        crate::services::device_pdf_service::PatientData {
            name: "REX".to_string(),
            owner: "Owner".to_string(),
            species: "Dog".to_string(),
            microchip_id: None,
            gender: "Male".to_string(),
            date_of_birth: dob.map(str::to_string),
        }
    }

    fn contract_json(
        patient: &crate::services::device_pdf_service::PatientData,
        samples: &[crate::services::device_pdf_service::DeviceTestData],
    ) -> serde_json::Value {
        let skopje_summer = chrono::FixedOffset::east_opt(2 * 3600).unwrap();
        let input = JavaPdfService::build_java_input(patient, samples, "/tmp/out.pdf", &skopje_summer);
        serde_json::to_value(&input).unwrap()
    }

    // The JAR parses date_of_birth as ISO yyyy-MM-dd. Whatever shape the
    // database or a typed override holds, the contract carries ISO or null.
    #[test]
    fn date_of_birth_is_sent_as_iso_date() {
        let exigo = sample("exigo_eos_vet", serde_json::json!({"WBC": "10.4"}));
        for (stored, sent) in [
            ("2020-01-15", serde_json::json!("2020-01-15")),
            ("2020-01-15T00:00:00Z", serde_json::json!("2020-01-15")),
            ("2020-01-15 00:00:00", serde_json::json!("2020-01-15")),
            ("15/01/2020", serde_json::json!("2020-01-15")),
            ("15.01.2020", serde_json::json!("2020-01-15")),
            ("", serde_json::Value::Null),
            ("sometime in spring", serde_json::Value::Null),
        ] {
            let json = contract_json(&patient_with_dob(Some(stored)), &[exigo.clone()]);
            assert_eq!(json["patient"]["date_of_birth"], sent, "stored {:?}", stored);
        }
    }

    fn analysis_datetime(device_type: &str, results: serde_json::Value) -> serde_json::Value {
        let mut s = sample(device_type, results);
        s.detected_at = chrono::DateTime::parse_from_rfc3339("2026-07-12T07:30:12Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let json = contract_json(&patient_with_dob(None), &[s]);
        json["samples"][0]["analysis_datetime"].clone()
    }

    // The test time is the analyzer's own clock (local wall time, sent as
    // ISO without offset); only when the device gave none does the receive
    // time stand in, converted to local time. Never raw UTC.
    #[test]
    fn analysis_datetime_is_the_device_time_in_local_wall_clock() {
        assert_eq!(
            analysis_datetime("exigo_eos_vet", serde_json::json!({"WBC": "10.4", "DATE": "2026-07-10 14:52:11"})),
            "2026-07-10T14:52:11"
        );
        assert_eq!(
            analysis_datetime("mnchip_pcr_analyzer", serde_json::json!({"IC": "32.03", "test_datetime": "20260604101801"})),
            "2026-06-04T10:18:01"
        );
        assert_eq!(
            analysis_datetime("mnchip_pointcare_chemistry", serde_json::json!({"GLU": "95", "message_datetime": "20260115003112"})),
            "2026-01-15T00:31:12"
        );
        assert_eq!(
            analysis_datetime("healvet_hv_fia_3000", serde_json::json!({"cCRP": "12.5", "test_datetime": "06-04-2026 11:49:53"})),
            "2026-04-06T11:49:53"
        );
    }

    // parsers M6: the PointCare report always said "serum".
    #[test]
    fn pointcare_sample_type_reaches_the_jar() {
        let chem = sample("mnchip_pointcare_chemistry", serde_json::json!({"GLU": "95", "sample_type": "Whole blood"}));
        let json = contract_json(&patient_with_dob(None), &[chem]);
        assert_eq!(json["samples"][0]["sample_type"], "Whole blood");

        let exigo = sample("exigo_eos_vet", serde_json::json!({"WBC": "10.4"}));
        let json = contract_json(&patient_with_dob(None), &[exigo]);
        assert!(json["samples"][0].get("sample_type").is_none());
    }

    #[test]
    fn legacy_pcr_samples_sort_with_pcr() {
        let json = contract_json(
            &patient_with_dob(None),
            &[
                sample("mnchip_pointcare_pcr_v1", serde_json::json!({"IC": "32.03"})),
                sample("exigo_eos_vet", serde_json::json!({"WBC": "10.4"})),
            ],
        );
        assert_eq!(json["samples"][0]["device_type"], "exigo_eos_vet");
        assert_eq!(json["samples"][1]["device_type"], "pcr");
    }

    #[test]
    fn analysis_datetime_falls_back_to_receive_time_in_local_zone() {
        assert_eq!(
            analysis_datetime("exigo_eos_vet", serde_json::json!({"WBC": "10.4"})),
            "2026-07-12T09:30:12"
        );
        assert_eq!(
            analysis_datetime("exigo_eos_vet", serde_json::json!({"WBC": "10.4", "DATE": "garbled"})),
            "2026-07-12T09:30:12"
        );
    }

    #[test]
    fn job_dirs_are_unique_per_job_and_removed_after() {
        let a = JavaPdfService::new_job_dir().unwrap();
        let b = JavaPdfService::new_job_dir().unwrap();
        assert_ne!(a.path(), b.path(), "two jobs share a temp folder");
        assert!(a.path().is_dir() && b.path().is_dir());
        let a_path = a.path().to_path_buf();
        fs::write(a_path.join("input.json"), "{}").unwrap();
        drop(a);
        assert!(!a_path.exists(), "job folder left behind");
    }

    #[test]
    fn java_command_is_headless_and_isolated() {
        let cmd = JavaPdfService::create_java_command(Path::new("x.jar"), &[OsStr::new("in.json")]);
        assert_eq!(cmd.get_program(), "java");
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"-Djava.awt.headless=true".to_string()));
        assert!(args.contains(&"-Dapple.awt.UIElement=true".to_string()));
        assert_eq!(args[args.len() - 3..], ["-jar", "x.jar", "in.json"]);
    }

    #[cfg(unix)]
    #[test]
    fn a_hung_process_is_stopped_at_the_time_limit() {
        let mut cmd = Command::new("sleep");
        cmd.arg("5").stdout(Stdio::piped()).stderr(Stdio::piped());
        let started = std::time::Instant::now();
        let result = JavaPdfService::run_with_timeout(cmd, Duration::from_millis(300));
        let err = result.err().expect("a hung process must be an error");
        assert!(err.contains("timed out"), "{}", err);
        assert!(started.elapsed() < Duration::from_secs(3), "waited {:?}", started.elapsed());
    }

    #[cfg(unix)]
    #[test]
    fn stderr_is_kept_on_success_and_large_output_does_not_block() {
        let mut cmd = Command::new("sh");
        cmd.arg("-c")
            .arg("echo PARSED_SAMPLE; head -c 300000 /dev/zero | tr '\\0' x 1>&2; echo PDF_WARN code=x 1>&2")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let out = JavaPdfService::run_with_timeout(cmd, Duration::from_secs(10)).unwrap();
        assert!(out.success);
        assert!(out.stdout.contains("PARSED_SAMPLE"));
        assert!(out.stderr.contains("PDF_WARN code=x"));
    }

    const DEV_JAR: &str = "../pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar";

    fn jar_available() -> bool {
        Path::new(DEV_JAR).exists() && Command::new("java").arg("-version").output().is_ok()
    }

    // The JAR writes into the job's own folder; only the finished PDF is
    // moved to the caller's path.
    #[test]
    fn jar_job_delivers_the_pdf_and_cleans_its_folder() {
        if !jar_available() {
            eprintln!("SKIP: JAR not built ({})", DEV_JAR);
            return;
        }
        let dest_dir = tempfile::tempdir().unwrap();
        let dest = dest_dir.path().join("Device Report - REX.pdf");
        let patient = patient_with_dob(Some("2020-01-15"));
        let input = JavaPdfService::build_java_input(
            &patient,
            &[sample("exigo_eos_vet", serde_json::json!({"WBC": "10.4", "WBC_L": "6.0", "WBC_H": "17.0"}))],
            &dest.to_string_lossy(),
            &chrono::Local,
        );
        JavaPdfService::run_jar_job(
            Path::new(DEV_JAR),
            serde_json::to_value(&input).unwrap(),
            &dest.to_string_lossy(),
            Duration::from_secs(60),
        )
        .unwrap();
        assert!(fs::metadata(&dest).unwrap().len() > 1000, "PDF missing or empty");
        assert_eq!(fs::read_dir(dest_dir.path()).unwrap().count(), 1, "stray files next to the PDF");
    }

    #[test]
    fn jar_failure_leaves_no_pdf_and_no_folder() {
        if !jar_available() {
            eprintln!("SKIP: JAR not built ({})", DEV_JAR);
            return;
        }
        let dest_dir = tempfile::tempdir().unwrap();
        let dest = dest_dir.path().join("empty.pdf");
        let input = serde_json::json!({
            "patient": {"name": "REX", "owner": "", "species": "Dog", "gender": "Male"},
            "samples": [{"device_type": "exigo_eos_vet", "sample_id": "1", "patient_id": "1",
                         "detected_at": "2026-07-10T12:00:00Z", "test_results": {}}],
            "output_path": dest.to_string_lossy(),
        });
        let err = JavaPdfService::run_jar_job(Path::new(DEV_JAR), input, &dest.to_string_lossy(), Duration::from_secs(60))
            .unwrap_err();
        assert!(err.contains("Java JAR failed"), "{}", err);
        assert!(!dest.exists());
    }

    #[test]
    fn jar_version_exact_match() {
        assert_eq!(
            JavaPdfService::classify_jar_version("0.7.2", "0.7.2"),
            JarVersionVerdict::Match { version: "0.7.2".to_string() }
        );
    }

    #[test]
    fn jar_version_normalizes_leading_v_and_whitespace() {
        // App version comes from semver (no 'v'); JAR --version prints the
        // manifest value, which is stamped from a tag that may carry a 'v'
        // and a trailing newline. Both must normalize to the same thing.
        assert_eq!(
            JavaPdfService::classify_jar_version("0.7.2", " v0.7.2\n"),
            JarVersionVerdict::Match { version: "0.7.2".to_string() }
        );
    }

    #[test]
    fn jar_version_mismatch_is_flagged() {
        // The July 2026 clinic case: 0.7.2 app, stale 0.7.0 JAR on disk.
        assert_eq!(
            JavaPdfService::classify_jar_version("0.7.2", "0.7.0"),
            JarVersionVerdict::Mismatch { app: "0.7.2".to_string(), jar: "0.7.0".to_string() }
        );
    }

    // Windows lab: an update leaves the previous version's 8 MB tool behind
    // (older ones held a 24 MB template), one more per release.
    #[test]
    fn old_pdf_tools_are_found_for_removal_and_the_current_one_is_kept() {
        let names: Vec<String> = [
            "pdf-generator-0.7.2.jar",
            "pdf-generator-0.99.0.jar",
            "pdf-generator-0.99.1.jar",
            "pdf-generator.jar",
            "pdf-generator-cli-1.0.0.jar",
            "pdfium",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let mut stale = JavaPdfService::stale_tool_files(&names, "0.99.1");
        stale.sort();
        assert_eq!(stale, vec!["pdf-generator-0.7.2.jar", "pdf-generator-0.99.0.jar", "pdf-generator.jar"]);
        assert!(JavaPdfService::stale_tool_files(&names, "0.0.0").is_empty(), "dev builds use the fixed name");
    }

    #[test]
    fn jar_resource_name_is_versioned_for_real_releases() {
        assert_eq!(
            JavaPdfService::jar_resource_name("0.7.3"),
            "resources/pdf-generator-0.7.3.jar"
        );
        assert_eq!(
            JavaPdfService::jar_resource_name("1.2.10"),
            "resources/pdf-generator-1.2.10.jar"
        );
    }

    #[test]
    fn jar_resource_name_falls_back_to_legacy_for_untagged_builds() {
        // Dev/E2E binaries report 0.0.0 and ship the fixed-name JAR.
        assert_eq!(
            JavaPdfService::jar_resource_name("0.0.0"),
            "resources/pdf-generator.jar"
        );
    }

    #[test]
    fn jar_version_dev_builds_are_skipped() {
        // Local Gradle build (no -PappVersion) stamps "dev"; dev app reports 0.0.0.
        assert!(matches!(
            JavaPdfService::classify_jar_version("0.0.0", "dev"),
            JarVersionVerdict::SkipDev { .. }
        ));
        assert!(matches!(
            JavaPdfService::classify_jar_version("0.0.0", "0.7.2"),
            JarVersionVerdict::SkipDev { .. }
        ));
        assert!(matches!(
            JavaPdfService::classify_jar_version("0.7.2", "dev"),
            JarVersionVerdict::SkipDev { .. }
        ));
    }

    #[test]
    fn a_jar_failure_names_its_cause_on_the_first_line() {
        let stderr = "PDF_WARN code=bad_detected_at value='x'\n\
                      Error generating PDF: Template not found: invoice.pdf\n\
                      java.io.IOException: Template not found: invoice.pdf\n\tat Foo.bar(Foo.java:1)\n";
        let msg = JavaPdfService::jar_failure_message("starting", stderr);
        assert_eq!(msg.lines().next(), Some("Error generating PDF: Template not found: invoice.pdf"));
        assert!(msg.contains("Java JAR failed"), "{}", msg);

        let bare = JavaPdfService::jar_failure_message("", "PDF_WARN code=x\nException in thread main: boom\n");
        assert_eq!(bare.lines().next(), Some("Exception in thread main: boom"));

        let silent = JavaPdfService::jar_failure_message("", "");
        assert!(!silent.lines().next().unwrap_or("").trim().is_empty(), "{:?}", silent);
    }

    #[test]
    fn pdf_warnings_are_picked_out_of_stderr() {
        let warnings = JavaPdfService::pdf_warnings("noise\nPDF_WARN code=a\n  PDF_WARN code=b value='1'\nmore");
        assert_eq!(warnings, ["PDF_WARN code=a", "PDF_WARN code=b value='1'"]);
    }

    #[test]
    fn a_pdf_counts_only_with_its_end_of_file_marker() {
        assert!(JavaPdfService::pdf_is_complete(b"%PDF-1.4\n1 0 obj\n%%EOF\n"));
        assert!(JavaPdfService::pdf_is_complete(b"%PDF-1.4\n%%EOF"));
        assert!(!JavaPdfService::pdf_is_complete(b"%PDF-1.4\n1 0 obj\n<< /Type"));
        assert!(!JavaPdfService::pdf_is_complete(b""));
    }

    #[test]
    fn a_copied_pdf_lands_whole_and_leaves_no_part_file() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("out.pdf");
        let dest = dir.path().join("Invoice.pdf");
        fs::write(&src, b"%PDF-new\n%%EOF").unwrap();
        fs::write(&dest, b"%PDF-old\n%%EOF").unwrap();

        JavaPdfService::copy_into_place(&src, &dest).unwrap();

        assert_eq!(fs::read(&dest).unwrap(), b"%PDF-new\n%%EOF");
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(!names.iter().any(|n| n.ends_with(".part")), "{:?}", names);
    }
}
