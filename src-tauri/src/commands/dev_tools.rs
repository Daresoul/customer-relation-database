/**
 * Dev Tools Commands
 *
 * Provides virtual serial port management and device simulation
 * for testing device integrations without physical hardware.
 *
 * NOTE: These commands are available in all builds (debug and release)
 * to support debugging and setup assistance in production environments.
 * The functionality is harmless - it only simulates device test data.
 */

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
#[allow(unused_imports)]
use tauri::Manager;

use std::process::{Child, Command};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use chrono::Local;

// Store running socat processes (Unix) or running state flag (Windows)
static VIRTUAL_PORT_PROCESSES: Lazy<Mutex<Vec<Child>>> = Lazy::new(|| Mutex::new(Vec::new()));
static VIRTUAL_PORTS_ENABLED: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VirtualPortConfig {
    pub name: String,
    pub app_port: String,
    pub test_port: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VirtualPortStatus {
    pub running: bool,
    pub platform: String,
    pub ports: Vec<VirtualPortInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VirtualPortInfo {
    pub name: String,
    pub app_port: String,
    pub test_port: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct HealvetParam {
    pub code: String,
    pub value: f64,
}

/// Get port configurations based on platform
fn get_port_configs() -> Vec<VirtualPortConfig> {
    if cfg!(target_os = "windows") {
        vec![
            VirtualPortConfig {
                name: "Healvet".to_string(),
                app_port: "COM3".to_string(),
                test_port: "COM4".to_string(),
            },
            VirtualPortConfig {
                name: "PointCare".to_string(),
                app_port: "COM5".to_string(),
                test_port: "COM6".to_string(),
            },
            VirtualPortConfig {
                name: "PCR".to_string(),
                app_port: "COM7".to_string(),
                test_port: "COM8".to_string(),
            },
        ]
    } else {
        vec![
            VirtualPortConfig {
                name: "Healvet".to_string(),
                app_port: "/tmp/ttyHealvet_app".to_string(),
                test_port: "/tmp/ttyHealvet_test".to_string(),
            },
            VirtualPortConfig {
                name: "PointCare".to_string(),
                app_port: "/tmp/ttyPointcare_app".to_string(),
                test_port: "/tmp/ttyPointcare_test".to_string(),
            },
            VirtualPortConfig {
                name: "PCR".to_string(),
                app_port: "/tmp/ttyMnchipPcr_app".to_string(),
                test_port: "/tmp/ttyMnchipPcr_test".to_string(),
            },
        ]
    }
}

/// Get the current status of virtual serial ports
#[tauri::command]
pub fn get_virtual_port_status() -> Result<VirtualPortStatus, String> {
    let processes = VIRTUAL_PORT_PROCESSES.lock().map_err(|e| e.to_string())?;
    let enabled = VIRTUAL_PORTS_ENABLED.lock().map_err(|e| e.to_string())?;

    // On Unix, check if we have running processes; on Windows, check the enabled flag
    let running = if cfg!(target_os = "windows") {
        *enabled
    } else {
        !processes.is_empty()
    };

    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

    let port_configs = get_port_configs();

    let ports: Vec<VirtualPortInfo> = port_configs
        .iter()
        .map(|config| VirtualPortInfo {
            name: config.name.clone(),
            app_port: config.app_port.clone(),
            test_port: config.test_port.clone(),
            status: if running { "running".to_string() } else { "stopped".to_string() },
        })
        .collect();

    Ok(VirtualPortStatus {
        running,
        platform: platform.to_string(),
        ports,
    })
}

/// Start virtual serial port pairs using socat (Unix) or com0com (Windows)
#[tauri::command]
pub fn start_virtual_ports() -> Result<(), String> {
    let mut processes = VIRTUAL_PORT_PROCESSES.lock().map_err(|e| e.to_string())?;
    let mut enabled = VIRTUAL_PORTS_ENABLED.lock().map_err(|e| e.to_string())?;

    // Don't start if already running
    if *enabled || !processes.is_empty() {
        return Err("Virtual ports are already running".to_string());
    }

    if cfg!(target_os = "windows") {
        log::info!("Windows detected - using com0com virtual COM ports");
        log::info!("Please ensure com0com port pairs are configured: COM3<->COM4, COM5<->COM6, COM7<->COM8");
        *enabled = true;
        Ok(())
    } else {
        let port_configs = get_port_configs();

        for config in port_configs {
            log::info!("Starting socat for {} ({} <-> {})", config.name, config.app_port, config.test_port);

            let child = Command::new("socat")
                .args([
                    "-d", "-d",
                    &format!("pty,raw,echo=0,link={}", config.app_port),
                    &format!("pty,raw,echo=0,link={}", config.test_port),
                ])
                .spawn()
                .map_err(|e| format!("Failed to start socat for {}: {}. Is socat installed?", config.name, e))?;

            processes.push(child);
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
        log::info!("Started {} virtual port pairs", processes.len());
        *enabled = true;
        Ok(())
    }
}

/// Stop all virtual serial port processes
#[tauri::command]
pub fn stop_virtual_ports() -> Result<(), String> {
    let mut processes = VIRTUAL_PORT_PROCESSES.lock().map_err(|e| e.to_string())?;
    let mut enabled = VIRTUAL_PORTS_ENABLED.lock().map_err(|e| e.to_string())?;

    for mut child in processes.drain(..) {
        let _ = child.kill();
    }

    *enabled = false;
    log::info!("Stopped all virtual port processes");
    Ok(())
}

/// Write bytes to a virtual serial port (PTY)
/// Uses direct file I/O instead of serialport crate to avoid PTY compatibility issues
fn write_to_serial_port(port_name: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::fs::OpenOptions;

    // Check if port exists first
    if !std::path::Path::new(port_name).exists() {
        return Err(format!(
            "Port {} does not exist. Make sure virtual ports are started and socat is running.",
            port_name
        ));
    }

    log::info!("📤 Writing {} bytes to virtual port {}", data.len(), port_name);

    // For virtual ports (PTYs created by socat), use direct file I/O
    // The serialport crate tries ioctl calls that fail on PTYs
    let mut file = OpenOptions::new()
        .write(true)
        .open(port_name)
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    file.write_all(data)
        .map_err(|e| format!("Failed to write to port {}: {}", port_name, e))?;

    file.flush()
        .map_err(|e| format!("Failed to flush port {}: {}", port_name, e))?;

    log::info!("✅ Successfully wrote {} bytes to {}", data.len(), port_name);

    Ok(())
}

/// Send test data to Healvet virtual port
#[tauri::command]
pub fn send_test_healvet(patient_id: String, params: Vec<HealvetParam>) -> Result<(), String> {
    let port_configs = get_port_configs();
    let healvet_config = port_configs
        .iter()
        .find(|c| c.name == "Healvet")
        .ok_or("Healvet port config not found")?;

    let datetime = Local::now().format("%Y%m%d%H%M%S").to_string();
    let mut messages = String::new();

    for param in &params {
        let msg = format!(
            "#AFS1000&{}&{:.2}&{}&&{}&{}&&M&1&",
            format!("SAMPLE-{}", rand::random::<u16>()),
            param.value,
            datetime,
            param.code,
            patient_id
        );
        messages.push_str(&msg);
    }
    messages.push_str("EE");

    write_to_serial_port(&healvet_config.test_port, messages.as_bytes())?;

    log::info!("Sent Healvet panel with {} params to {}", params.len(), healvet_config.test_port);
    Ok(())
}

/// Generate PointCare test results based on test type
fn generate_pointcare_results(test_type: i32) -> Vec<(&'static str, f64, &'static str, &'static str)> {
    match test_type {
        55 => vec![
            ("GLU", 95.0, "mg/dL", "70-110"),
            ("BUN", 18.0, "mg/dL", "7-25"),
            ("CREA", 1.1, "mg/dL", "0.6-1.4"),
            ("TP", 7.2, "g/dL", "6.0-8.3"),
            ("ALB", 4.1, "g/dL", "3.5-5.0"),
            ("GLOB", 3.1, "g/dL", "2.0-3.5"),
            ("ALT", 35.0, "U/L", "10-120"),
            ("ALP", 85.0, "U/L", "45-250"),
        ],
        61 => vec![
            ("ALT", 42.0, "U/L", "10-120"),
            ("AST", 28.0, "U/L", "10-50"),
            ("ALP", 95.0, "U/L", "45-250"),
            ("GGT", 8.0, "U/L", "0-14"),
            ("TBIL", 0.3, "mg/dL", "0.1-0.5"),
            ("ALB", 3.8, "g/dL", "3.5-5.0"),
        ],
        62 => vec![
            ("BUN", 22.0, "mg/dL", "7-25"),
            ("CREA", 1.3, "mg/dL", "0.6-1.4"),
            ("PHOS", 4.5, "mg/dL", "2.5-6.0"),
            ("CA", 10.2, "mg/dL", "9.0-11.5"),
            ("K", 4.8, "mEq/L", "3.5-5.5"),
            ("NA", 145.0, "mEq/L", "135-150"),
        ],
        57 => vec![
            ("NA", 142.0, "mEq/L", "135-150"),
            ("K", 4.2, "mEq/L", "3.5-5.5"),
            ("CL", 105.0, "mEq/L", "95-110"),
            ("TCO2", 24.0, "mEq/L", "20-28"),
        ],
        _ => vec![
            ("GLU", 100.0, "mg/dL", "70-110"),
        ],
    }
}

/// Send test data to PointCare virtual port
#[tauri::command]
pub fn send_test_pointcare(patient_id: String, test_type: i32) -> Result<(), String> {
    let port_configs = get_port_configs();
    let pointcare_config = port_configs
        .iter()
        .find(|c| c.name == "PointCare")
        .ok_or("PointCare port config not found")?;

    let datetime = Local::now().format("%Y%m%d%H%M%S").to_string();
    let msg_control_id = format!("MSG{}", rand::random::<u32>());

    let results = generate_pointcare_results(test_type);

    let mut hl7_message = format!(
        "\x0BMSH|^~\\&|MNCHIP|POINTCARE|VET|CLINIC|{}||ORU^R01|{}|P|2.3.1\r\n\
         PID|||{}||Test Patient\r\n\
         OBR|1||{}|{}|||{}\r\n",
        datetime, msg_control_id, patient_id, msg_control_id, test_type, datetime
    );

    for (i, (code, value, unit, range)) in results.iter().enumerate() {
        hl7_message.push_str(&format!(
            "OBX|{}|NM|{}||{:.2}|{}|{}|N||F\r\n",
            i + 1, code, value, unit, range
        ));
    }
    hl7_message.push('\x1C');
    hl7_message.push('\r');

    write_to_serial_port(&pointcare_config.test_port, hl7_message.as_bytes())?;

    log::info!("Sent PointCare test type {} to {}", test_type, pointcare_config.test_port);
    Ok(())
}

/// Send test data to PCR virtual port
#[tauri::command]
pub fn send_test_pcr(patient_id: String, positive: bool) -> Result<(), String> {
    let port_configs = get_port_configs();
    let pcr_config = port_configs
        .iter()
        .find(|c| c.name == "PCR")
        .ok_or("PCR port config not found")?;

    let datetime = Local::now().format("%Y%m%d%H%M%S").to_string();
    let msg_control_id = format!("MSG{}", rand::random::<u32>());
    let result = if positive { "POSITIVE" } else { "NEGATIVE" };

    let hl7_message = format!(
        "\x0BMSH|^~\\&|MNCHIP|PCR|VET|CLINIC|{}||ORU^R01|{}|P|2.3.1\r\n\
         PID|||{}||Test Patient\r\n\
         OBR|1||{}|PCR|||{}\r\n\
         OBX|1|ST|PCR_RESULT||{}|||N||F\r\n\
         \x1C\r",
        datetime, msg_control_id, patient_id, msg_control_id, datetime, result
    );

    write_to_serial_port(&pcr_config.test_port, hl7_message.as_bytes())?;

    log::info!("Sent PCR {} result to {}", result, pcr_config.test_port);
    Ok(())
}

/// Generate Exigo XML test content
fn generate_exigo_xml(sample_id: &str, datetime: &str) -> String {
    format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<ExigoResult>
  <Header>
    <SampleId>{}</SampleId>
    <DateTime>{}</DateTime>
    <DeviceType>Exigo Eos Vet</DeviceType>
    <OperatorId>TEST</OperatorId>
  </Header>
  <Results>
    <Parameter>
      <Code>WBC</Code>
      <Value>12.5</Value>
      <Unit>10^9/L</Unit>
      <RefRange>5.5-16.9</RefRange>
      <Flag>N</Flag>
    </Parameter>
    <Parameter>
      <Code>RBC</Code>
      <Value>7.2</Value>
      <Unit>10^12/L</Unit>
      <RefRange>5.5-8.5</RefRange>
      <Flag>N</Flag>
    </Parameter>
    <Parameter>
      <Code>HGB</Code>
      <Value>15.8</Value>
      <Unit>g/dL</Unit>
      <RefRange>12-18</RefRange>
      <Flag>N</Flag>
    </Parameter>
    <Parameter>
      <Code>HCT</Code>
      <Value>45.2</Value>
      <Unit>%</Unit>
      <RefRange>37-55</RefRange>
      <Flag>N</Flag>
    </Parameter>
    <Parameter>
      <Code>PLT</Code>
      <Value>285</Value>
      <Unit>10^9/L</Unit>
      <RefRange>175-500</RefRange>
      <Flag>N</Flag>
    </Parameter>
  </Results>
</ExigoResult>"#, sample_id, datetime)
}

/// Drop a test Exigo XML file in the watch directory
#[tauri::command]
pub async fn send_test_exigo(app_handle: AppHandle) -> Result<(), String> {
    use crate::database::SeaOrmPool;

    // Use try_state to avoid panic if database not available
    let db = app_handle.try_state::<SeaOrmPool>()
        .ok_or("Database not available. Make sure the app is fully initialized.")?;

    let integrations = crate::services::device_integration::DeviceIntegrationService::get_all(&*db)
        .await
        .map_err(|e| e.to_string())?;

    let exigo_integration = integrations
        .iter()
        .find(|i| i.device_type == crate::models::device_integration::DeviceType::ExigoEosVet && i.enabled)
        .ok_or("No enabled Exigo integration found. Go to Settings → Device Integrations and enable an Exigo integration with a watch directory.")?;

    let watch_dir = exigo_integration
        .watch_directory
        .as_ref()
        .ok_or("Exigo integration has no watch directory configured")?;

    // Verify watch directory exists
    let watch_path = std::path::Path::new(watch_dir);
    if !watch_path.exists() {
        return Err(format!(
            "Watch directory does not exist: {}. Create it or update the Exigo integration settings.",
            watch_dir
        ));
    }

    let datetime = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let sample_id = format!("TEST-{}", rand::random::<u16>());

    let xml_content = generate_exigo_xml(&sample_id, &datetime);

    let file_path = watch_path.join(format!("exigo_test_{}.xml", sample_id));
    std::fs::write(&file_path, &xml_content)
        .map_err(|e| format!("Failed to write Exigo test file: {}", e))?;

    log::info!("✅ Created Exigo test file at {:?} ({} bytes)", file_path, xml_content.len());
    Ok(())
}
