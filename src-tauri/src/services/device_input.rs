use std::thread;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock, mpsc};
use serialport::{available_ports, SerialPortType, UsbPortInfo};
use serde::{Serialize, Deserialize};
use hidapi::HidApi;
use tauri::{AppHandle, Manager};
use chrono::Utc;
use rand::Rng;
use crate::services::device_input::PortType::HIDDevice;
use crate::services::device_parser::DeviceParserService;
use crate::services::file_storage::FileStorageService;
use crate::commands::file_history::record_device_file_access_internal;
use crate::database::connection::DatabasePool;

// Thread handle for managing listener lifecycle
// Stores JoinHandle, shutdown channel, and cleanup data for graceful thread termination
// integration_id and port_name are stored to enable proper cleanup even if thread panics
struct ListenerThread {
    handle: thread::JoinHandle<()>,
    shutdown_sender: mpsc::Sender<()>,
    integration_id: i64,
    port_name: String,
}

// Track active listeners to prevent duplicates (listener_key -> thread info)
static ACTIVE_LISTENERS: OnceLock<Mutex<HashMap<String, ListenerThread>>> = OnceLock::new();

// Track active ports to prevent multiple integrations on same port (port_name -> listener_key)
static ACTIVE_PORTS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

// Track connection status for each device
static CONNECTION_STATUS: OnceLock<Mutex<HashMap<String, DeviceConnectionStatus>>> = OnceLock::new();

fn get_active_listeners() -> &'static Mutex<HashMap<String, ListenerThread>> {
    ACTIVE_LISTENERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_active_ports() -> &'static Mutex<HashMap<String, String>> {
    ACTIVE_PORTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_connection_status() -> &'static Mutex<HashMap<String, DeviceConnectionStatus>> {
    CONNECTION_STATUS.get_or_init(|| Mutex::new(HashMap::new()))
}

// Configuration for retry behavior
const MAX_RETRY_ATTEMPTS: u32 = 10;  // Maximum number of retry attempts before giving up
const BASE_RETRY_DELAY_SECS: u64 = 1;  // Base delay for exponential backoff (1 second)
const MAX_RETRY_DELAY_SECS: u64 = 60;  // Maximum delay cap (60 seconds)

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DeviceConnectionStatus {
    pub integration_id: i64,
    pub port_name: String,
    pub device_type: String,
    pub status: ConnectionState,
    pub last_connected: Option<String>,
    pub last_error: Option<String>,
    pub retry_count: u32,
    pub next_retry: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum ConnectionState {
    Connected,
    Disconnected,
    Connecting,
    Error,
}

/// Update connection status and emit event to frontend
fn update_connection_status(app_handle: &AppHandle, integration_id: i64, port_name: &str, device_type: &str, status: ConnectionState, error: Option<String>, retry_count: u32) {
    log::info!("🔄 Device connection status update - Integration ID: {}, Port: {}, Device: {}, Status: {:?}, Retry: {}",
        integration_id, port_name, device_type, status, retry_count);

    if let Some(ref err) = error {
        log::error!("❌ Device error for {} ({}): {}", device_type, port_name, err);
    }

    let now = Utc::now();
    let next_retry = if status == ConnectionState::Disconnected || status == ConnectionState::Error {
        let retry_time = (now + chrono::Duration::seconds(5)).to_rfc3339();
        log::info!("⏰ Next reconnection attempt for {} ({}) scheduled at: {}", device_type, port_name, retry_time);
        Some(retry_time)
    } else {
        None
    };

    let connection_status = DeviceConnectionStatus {
        integration_id,
        port_name: port_name.to_string(),
        device_type: device_type.to_string(),
        status: status.clone(),
        last_connected: if status == ConnectionState::Connected {
            let connected_time = now.to_rfc3339();
            log::info!("✅ Device {} ({}) connected successfully at {}", device_type, port_name, connected_time);
            Some(connected_time)
        } else {
            None
        },
        last_error: error,
        retry_count,
        next_retry,
    };

    // Store in global state
    {
        let mut statuses = get_connection_status().lock()
            .expect("CONNECTION_STATUS mutex poisoned - a thread panicked while holding the lock");
        statuses.insert(format!("{}:{}", integration_id, port_name), connection_status.clone());
        log::info!("💾 Stored connection status in global state. Total tracked devices: {}", statuses.len());
    }

    // Emit to frontend
    match app_handle.emit_all("device-connection-status", &connection_status) {
        Ok(_) => log::info!("📡 Emitted device-connection-status event to frontend for {} ({})", device_type, port_name),
        Err(e) => log::error!("❌ Failed to emit device-connection-status event: {}", e),
    }
}

/// Get all connection statuses
pub fn get_all_connection_statuses() -> Vec<DeviceConnectionStatus> {
    let statuses = get_connection_status().lock()
        .expect("CONNECTION_STATUS mutex poisoned - a thread panicked while holding the lock");
    statuses.values().cloned().collect()
}

#[derive(Serialize)]
pub struct UsbInfo {
    pub vid: u16,
    pub pid: u16,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub path: Option<String>,
    pub device_name: Option<String>, // Friendly device name from USB ID database
}

impl UsbInfo {
    fn convert_usb_port_info(usb_port_info: UsbPortInfo) -> UsbInfo {
        // Extract path before moving other fields
        let path = extract_usb_path(&usb_port_info);

        UsbInfo {
            vid: usb_port_info.vid,
            pid: usb_port_info.pid,
            serial_number: usb_port_info.serial_number,
            manufacturer: usb_port_info.manufacturer,
            product: usb_port_info.product,
            // USB path for physical port identification
            // This helps differentiate identical devices on USB hubs
            path,
            device_name: None, // Populated asynchronously later
        }
    }
}

/// Extract USB physical location path from port info
/// Returns something like "1-2.3" meaning "Port 2 on Hub on Root Port 1, Sub-port 3"
#[cfg(windows)]
fn extract_usb_path(usb_port_info: &UsbPortInfo) -> Option<String> {
    // serialport-rs doesn't expose the full device instance path on Windows
    // We'll need to enhance the registry scanning to get this
    // For now, return None but we'll populate this in scan_windows_registry_ports
    None
}

#[cfg(not(windows))]
fn extract_usb_path(_usb_port_info: &UsbPortInfo) -> Option<String> {
    None
}

#[derive(Serialize)]
pub enum PortType {
    SerialUSBPort(UsbInfo),
    SerialPciPort,
    SerialBluetoothPort,
    SerialUnknown,
    HIDDevice(UsbInfo),
    VirtualPort(String), // Virtual/PTY port with description
    BuiltInPort,         // Built-in motherboard serial port (COM1, etc.)
    #[allow(dead_code)] // Used on Windows only for registry entries
    DisconnectedPort(String), // Registry entry for disconnected device with device path
}

impl PortType {
    fn convert_serial_port(port: SerialPortType) -> PortType {
        match port {
            SerialPortType::PciPort => PortType::SerialPciPort,
            SerialPortType::BluetoothPort => PortType::SerialBluetoothPort,
            SerialPortType::UsbPort(usb_port_info) => PortType::SerialUSBPort(UsbInfo::convert_usb_port_info(usb_port_info)),
            SerialPortType::Unknown => PortType::SerialUnknown
        }
    }
}

#[derive(Serialize)]
pub struct PortInfo {
    pub port_name: String,
    pub port_type: PortType,
}

/// Device protocol configuration
pub struct DeviceProtocol {
    pub start_symbol: Option<u8>,
    pub end_symbol: u8,
    pub baud_rate: u32,
}

/// Get protocol configuration for a specific device type
pub fn get_device_protocol(device_type: &str) -> DeviceProtocol {
    match device_type {
        "healvet_hv_fia_3000" => DeviceProtocol {
            start_symbol: None,        // Uses #AFS1000 text marker, not binary STX
            end_symbol: b'E',          // 'E' - looks for "EE" sequence (two E's)
            baud_rate: 9600,
        },
        "mnchip_pointcare_pcr_v1" => DeviceProtocol {
            start_symbol: None,        // No start symbol
            end_symbol: 0x0D,          // Carriage return (\r) - HL7 uses \r\r as end marker
            baud_rate: 115200,
        },
        "exigo_eos_vet" => DeviceProtocol {
            start_symbol: None,
            end_symbol: 0x0A,          // Newline (\n)
            baud_rate: 9600,
        },
        _ => DeviceProtocol {
            start_symbol: None,
            end_symbol: 0x0A,          // Default: newline
            baud_rate: 9600,
        },
    }
}

/// Extract friendly description from virtual port name
fn get_virtual_port_description(port_name: &str) -> String {
    if port_name.contains("ttyHealvet") {
        "Healvet HV-FIA 3000 Virtual Port".to_string()
    } else if port_name.contains("ttyPointcare") {
        "MNCHIP PointCare PCR Virtual Port".to_string()
    } else if port_name.contains("ttyExigo") {
        "Exigo Eos Vet Virtual Port".to_string()
    } else if port_name.starts_with("/tmp/tty") || port_name.starts_with("/tmp/pty") {
        let name = port_name.replace("/tmp/", "").replace("tty", "").replace("pty", "");
        format!("Virtual Serial Port ({})", name)
    } else if port_name.starts_with("/dev/pts/") {
        let num = port_name.replace("/dev/pts/", "");
        format!("Pseudo-Terminal (pts/{})", num)
    } else {
        "Virtual/Test Port".to_string()
    }
}

/// Scan Windows registry for ALL COM ports (including disconnected/hidden devices)
/// Registry location: HKEY_LOCAL_MACHINE\HARDWARE\DEVICEMAP\SERIALCOMM
///
/// Note: This registry key may not exist on systems without any serial ports
/// (e.g., modern laptops without RS232 ports). This is expected behavior.
#[cfg(windows)]
fn scan_windows_registry_ports() -> Result<Vec<PortInfo>, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let mut ports = vec![];

    // Open the SERIALCOMM registry key
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let serialcomm_key = match hklm.open_subkey("HARDWARE\\DEVICEMAP\\SERIALCOMM") {
        Ok(key) => key,
        Err(_) => {
            // Registry key doesn't exist - this is normal on systems without serial ports
            // (modern laptops, etc.). Return empty list instead of error.
            return Ok(vec![]);
        }
    };

    // Enumerate all values in the key
    // Each value name is the device path, value data is the COM port name (e.g., "COM3")
    // Device path formats:
    // - Built-in: \Device\Serial0, \Device\Serial1, etc.
    // - FTDI USB: \Device\VCP0, \Device\FTDIBUS#VID_0403+PID_6001+...
    // - Standard USB: \Device\USBSER000, USB#VID_xxxx&PID_xxxx#...
    for (device_path, com_port) in serialcomm_key.enum_values()
        .filter_map(|x| x.ok())
        .filter_map(|(name, value)| {
            // value is a RegValue, extract String from it
            match value {
                winreg::RegValue { vtype: winreg::enums::RegType::REG_SZ, bytes } => {
                    // Convert bytes to String (UTF-16 LE encoded)
                    let wide: Vec<u16> = bytes.chunks_exact(2)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .take_while(|&c| c != 0) // Stop at null terminator
                        .collect();
                    String::from_utf16(&wide).ok().map(|s| (name, s))
                },
                _ => None,
            }
        })
    {
        // Try to get USB location path from the device path
        let usb_location = extract_usb_location_from_device_path(&device_path);

        // Determine port type based on device path pattern
        let port_type = if device_path.starts_with("\\Device\\Serial") {
            // Built-in motherboard serial port (e.g., \Device\Serial0 -> COM1)
            PortType::BuiltInPort
        } else if device_path.contains("FTDIBUS") || device_path.contains("VCP")
                || device_path.contains("USBSER") || device_path.contains("USB#VID_") {
            // Try to extract USB info from device path for disconnected devices
            let usb_info = extract_usb_info_from_device_path(&device_path, usb_location);
            if let Some(info) = usb_info {
                PortType::SerialUSBPort(info)
            } else {
                // USB serial device but couldn't parse details
                // Probably disconnected since serialport crate didn't find it with full metadata
                PortType::DisconnectedPort(device_path.clone())
            }
        } else {
            // Unknown device path pattern - treat as disconnected/unknown
            PortType::DisconnectedPort(device_path.clone())
        };

        ports.push(PortInfo {
            port_name: com_port,
            port_type,
        });
    }

    Ok(ports)
}

/// Extract USB location path from Windows device path
/// Example: USB#VID_0403&PID_6001#5&2E06D5E7&0&3 -> "Port 3"
#[cfg(windows)]
fn extract_usb_location_from_device_path(device_path: &str) -> Option<String> {
    // Windows device instance IDs contain physical location info in the last segment
    // Format: USB#VID_xxxx&PID_xxxx#SerialOrLocation
    // Location format: 5&2E06D5E7&0&3 where last number (3) is the port number

    // Try to extract the location segment (after last #)
    if let Some(location_part) = device_path.split('#').last() {
        // Check if it contains & separators (indicates location info, not serial number)
        if location_part.contains('&') {
            // Extract the last number after the last &
            if let Some(port_num) = location_part.split('&').last() {
                // Try to parse as number
                if let Ok(_num) = port_num.parse::<u32>() {
                    return Some(format!("USB Port {}", port_num));
                }
            }
        }
    }

    None
}

/// Extract USB info (VID/PID/etc) from Windows device path in registry
/// This helps identify disconnected devices that aren't in serialport::available_ports()
#[cfg(windows)]
fn extract_usb_info_from_device_path(device_path: &str, usb_location: Option<String>) -> Option<UsbInfo> {
    // Try FTDI format: VID_xxxx+PID_xxxx
    let vid_pid_regex = regex::Regex::new(r"VID_([0-9A-F]{4})[+&]PID_([0-9A-F]{4})").ok()?;

    if let Some(captures) = vid_pid_regex.captures(device_path) {
        let vid = u16::from_str_radix(&captures[1], 16).ok()?;
        let pid = u16::from_str_radix(&captures[2], 16).ok()?;

        // Try to extract serial number (it's after the second # if present and doesn't contain &)
        let serial_number = device_path.split('#')
            .nth(2)
            .filter(|s| !s.contains('&'))
            .map(|s| s.to_string());

        return Some(UsbInfo {
            vid,
            pid,
            serial_number,
            manufacturer: None, // Not available from device path
            product: None,      // Not available from device path
            path: usb_location,
            device_name: None,  // Populated asynchronously later
        });
    }

    None
}

/// Enrich PortInfo with USB device names (call this from commands/frontend)
/// This is async so it can do web lookups if needed
pub async fn enrich_port_info_with_device_names(mut ports: Vec<PortInfo>) -> Vec<PortInfo> {
    log::info!("🔍 Enriching {} ports with USB device names...", ports.len());

    let mut enriched_count = 0;
    let mut skipped_count = 0;
    for port in &mut ports {
        match &mut port.port_type {
            PortType::SerialUSBPort(ref mut usb_info) | PortType::HIDDevice(ref mut usb_info) => {
                log::info!("   📝 Enriching {} - VID:{:04X} PID:{:04X}", port.port_name, usb_info.vid, usb_info.pid);
                // Lookup friendly device name
                if let Some(name) = lookup_usb_device_name(usb_info.vid, usb_info.pid).await {
                    log::info!("   ✅ Found device name for {} - {}", port.port_name, name);
                    usb_info.device_name = Some(name);
                    enriched_count += 1;
                } else {
                    log::info!("   ⚠️  No device name found for {} (VID:{:04X} PID:{:04X})", port.port_name, usb_info.vid, usb_info.pid);
                }
            }
            PortType::SerialPciPort => {
                log::info!("   ⏭️  Skipping {} - SerialPciPort", port.port_name);
                skipped_count += 1;
            }
            PortType::VirtualPort(desc) => {
                log::info!("   ⏭️  Skipping {} - VirtualPort ({})", port.port_name, desc);
                skipped_count += 1;
            }
            PortType::SerialBluetoothPort => {
                log::info!("   ⏭️  Skipping {} - SerialBluetoothPort", port.port_name);
                skipped_count += 1;
            }
            _ => {
                log::info!("   ⏭️  Skipping {} - Unknown type", port.port_name);
                skipped_count += 1;
            }
        }
    }

    log::info!("✅ Enriched {}/{} devices with USB names (skipped: {})", enriched_count, ports.len(), skipped_count);
    ports
}

/// Hybrid USB device name lookup - tries embedded database first, then web API fallback
/// Returns a friendly device name like "FTDI FT232 USB-Serial Converter"
async fn lookup_usb_device_name(vid: u16, pid: u16) -> Option<String> {
    use usb_ids::FromId;

    log::info!("      🔎 Looking up VID:{:04X} PID:{:04X}", vid, pid);

    // 1. Try embedded database first (fast, offline, covers 99% of devices)
    // First check if the vendor exists
    match usb_ids::Vendor::from_id(vid) {
        Some(vendor) => {
            log::info!("      📋 Found vendor: {}", vendor.name());
            // Now try to find the specific device
            match usb_ids::Device::from_vid_pid(vid, pid) {
                Some(device) => {
                    let vendor_name = device.vendor().name();
                    let product_name = device.name();
                    let full_name = format!("{} {}", vendor_name, product_name);
                    log::info!("      ✅ Found device in embedded DB: {}", full_name);
                    return Some(full_name);
                }
                None => {
                    log::info!("      ⚠️  Vendor found but device PID:{:04X} not in DB, will use vendor name as fallback", pid);
                    // Fallback: return vendor name for internal/proprietary devices
                    // This handles cases like Apple internal keyboard controllers that aren't in the public database
                    let vendor_name = vendor.name().to_string();
                    log::info!("      ✅ Using vendor name as fallback: {}", vendor_name);
                    return Some(vendor_name);
                }
            }
        }
        None => {
            log::info!("      ❌ Vendor VID:{:04X} not found in embedded DB", vid);
        }
    }

    // 2. Fall back to web lookup for new/rare devices (requires internet)
    match lookup_usb_device_web(vid, pid).await {
        Ok(name) => {
            log::info!("      ✅ Found via web lookup: {}", name);
            return Some(name);
        }
        Err(e) => {
            log::info!("      ❌ Web lookup failed: {}", e);
        }
    }

    // 3. Final fallback - just show VID/PID
    log::info!("      ⚠️  No lookup method succeeded for VID:{:04X} PID:{:04X}", vid, pid);
    None
}

/// Web-based USB device lookup using devicehunt.com API
async fn lookup_usb_device_web(vid: u16, pid: u16) -> Result<String, String> {
    let url = format!(
        "https://devicehunt.com/api/search?vendor_id={:04x}&device_id={:04x}",
        vid, pid
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Web lookup failed: {}", e))?;

    if response.status().is_success() {
        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("JSON parse error: {}", e))?;

        if let Some(name) = json.get("device_name").and_then(|v| v.as_str()) {
            return Ok(name.to_string());
        }
    }

    Err("Device not found in web database".to_string())
}

pub fn scan_serial_ports() -> Result<Vec<PortInfo>, String> {
    let mut ports = vec![];
    let mut seen_ports = std::collections::HashSet::new();

    // 1. Scan standard serial ports using serialport crate (CONNECTED devices only)
    let available_ports = available_ports().map_err(|_| "Failed to list available ports".to_string())?;

    for port in available_ports {
        seen_ports.insert(port.port_name.clone());
        let port_info = PortInfo {
            port_name: port.port_name,
            port_type: PortType::convert_serial_port(port.port_type),
        };
        ports.push(port_info);
    }

    // 2. On Windows, scan registry for ALL COM ports (including disconnected/hidden)
    #[cfg(windows)]
    {
        if let Ok(registry_ports) = scan_windows_registry_ports() {
            for registry_port in registry_ports {
                // Only add if not already found by serialport crate
                if !seen_ports.contains(&registry_port.port_name) {
                    seen_ports.insert(registry_port.port_name.clone());
                    ports.push(registry_port);
                }
            }
        }
    }

    // 2. Scan for virtual/PTY ports on macOS and Linux
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        // Common locations for serial ports (standard, USB, virtual)
        let virtual_port_patterns = [
            // macOS ports
            "/dev/tty.*",      // macOS USB serial, Bluetooth, virtual ports (e.g., /dev/tty.usbserial-1234)
            "/dev/cu.*",       // macOS call-out devices
            // Linux standard serial ports
            "/dev/ttyS*",      // Standard serial ports (COM1=/dev/ttyS0, etc.)
            "/dev/ttyUSB*",    // USB serial adapters (FTDI, CH340, etc.)
            "/dev/ttyACM*",    // USB ACM modems (Arduino, etc.)
            "/dev/ttyAMA*",    // ARM/Raspberry Pi serial ports
            "/dev/ttyO*",      // OMAP serial ports
            "/dev/ttymxc*",    // i.MX serial ports
            // Virtual/PTY ports
            "/dev/pts/*",      // Linux pseudo-terminals
            "/tmp/tty*",       // Common location for socat virtual ports
            "/tmp/pty*",       // Another common virtual port pattern
        ];

        for pattern in virtual_port_patterns {
            if let Ok(entries) = glob::glob(pattern) {
                for entry in entries.flatten() {
                    let port_name = entry.to_string_lossy().to_string();

                    // Skip if already found by serialport
                    if seen_ports.contains(&port_name) {
                        continue;
                    }

                    // Check if it's a character device (serial port) or named pipe
                    if let Ok(metadata) = std::fs::metadata(&entry) {
                        use std::os::unix::fs::FileTypeExt;
                        let file_type = metadata.file_type();

                        if file_type.is_char_device() || file_type.is_fifo() {
                            // Determine if it's a virtual port or built-in serial
                            let port_type = if port_name.starts_with("/tmp/") || port_name.starts_with("/dev/pts/") {
                                // Virtual/PTY port - extract description
                                let description = get_virtual_port_description(&port_name);
                                PortType::VirtualPort(description)
                            } else if port_name.starts_with("/dev/ttyS") {
                                // Built-in serial port (Linux standard serial)
                                PortType::BuiltInPort
                            } else {
                                // Other character devices (could be USB that serialport missed)
                                PortType::SerialUnknown
                            };

                            seen_ports.insert(port_name.clone());
                            ports.push(PortInfo {
                                port_name,
                                port_type,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(ports)
}

pub fn scan_hid_ports() -> Result<Vec<PortInfo>, String> {
    let mut ports = vec![];

    let api = HidApi::new().map_err(|e| e.to_string())?;
    let devices: Vec<UsbInfo> = api.device_list().map(|device| UsbInfo {
        vid: device.vendor_id(),
        pid: device.product_id(),
        manufacturer: device.manufacturer_string().map(|s| s.to_string()),
        product: device.product_string().map(|s| s.to_string()),
        serial_number: device.serial_number().map(|s| s.to_string()),
        path: Some(device.path().to_string_lossy().to_string()),
        device_name: None, // Populated asynchronously later
    }).collect();
    for device in devices {
        let vid = device.vid;
        let pid = device.pid;
        let port_info = PortInfo {
            port_name: device.product.clone().unwrap_or_else(||
                format!("UNKNOWN DEVICE: HID Device {:04X}:{:04X}", vid, pid)
            ),
            port_type: HIDDevice(device)
        };
        ports.push(port_info);
    }
    Ok(ports)
}

pub fn scan_ports() -> Result<Vec<PortInfo>, String> {
    let mut ports = vec![];
    let mut serial_ports = scan_serial_ports().map_err(|_| "Failed to list available serial ports".to_string())?;
    ports.append(&mut serial_ports);
    let mut hid_devices = scan_hid_ports().map_err(|e| e.to_string())?;
    ports.append(&mut hid_devices);

    Ok(ports)
}

/// Calculate exponential backoff delay with jitter
/// Formula: min((2^attempt * base_delay) + random_jitter, max_delay)
/// Based on AWS best practices: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
fn calculate_backoff_delay(attempt: u32) -> Duration {
    if attempt == 0 {
        return Duration::from_secs(0);
    }

    // Calculate base exponential delay: 2^attempt * base_delay
    let exp_delay = BASE_RETRY_DELAY_SECS.saturating_mul(2u64.saturating_pow(attempt));

    // Cap at maximum delay
    let capped_delay = std::cmp::min(exp_delay, MAX_RETRY_DELAY_SECS);

    // Add jitter: random value between 0 and min(capped_delay, 5 seconds)
    // Jitter prevents synchronized retries from multiple clients
    let jitter_max = std::cmp::min(capped_delay, 5);
    let jitter = if jitter_max > 0 {
        rand::thread_rng().gen_range(0..=jitter_max)
    } else {
        0
    };

    Duration::from_secs(capped_delay + jitter)
}

/// Stop all active listeners - used for graceful shutdown
/// Returns number of threads that were stopped
pub fn stop_all_listeners() -> usize {
    log::info!("🛑 Stopping all active device listeners for graceful shutdown");

    let listener_keys: Vec<String> = {
        let listeners = get_active_listeners().lock()
            .expect("ACTIVE_LISTENERS mutex poisoned - a thread panicked while holding the lock");
        listeners.keys().cloned().collect()
    };

    let count = listener_keys.len();
    log::info!("📋 Found {} active listeners to stop", count);

    for key in listener_keys {
        // Use split_once() instead of split() to handle port names containing ':'
        // split_once() only splits on first ':', making it robust against edge cases
        // Example: "/dev/tty:special:device:healvet" -> ("/dev/tty:special:device", "healvet")
        if let Some((port_name, device_type)) = key.split_once(':') {
            stop_listen(port_name, device_type);
        } else {
            log::warn!("⚠️  Malformed listener key (no ':' separator): {}", key);
        }
    }

    count
}

/// Start listening to a serial port with the given device protocol
/// With exponential backoff retry (max 10 attempts, up to 60s delay)
/// Uses mpsc channel for graceful shutdown signal
pub fn start_listen(
    app_handle: AppHandle,
    port_name: String,
    device_type: String,
    integration_id: i64,
) -> Result<(), String> {
    log::info!("🎧 Starting device listener - Integration ID: {}, Port: {}, Device Type: {}",
        integration_id, port_name, device_type);

    let listener_key = format!("{}:{}", port_name, device_type);

    // Create shutdown channel first (before acquiring locks)
    let (shutdown_tx, shutdown_rx) = mpsc::channel();

    let device_type_clone = device_type.clone();
    let port_name_clone = port_name.clone();

    // Atomically check for duplicates, reserve port, spawn thread, and register
    // This prevents TOCTOU race conditions by holding locks until thread is registered
    {
        let mut listeners = get_active_listeners().lock()
            .expect("ACTIVE_LISTENERS mutex poisoned - a thread panicked while holding the lock");

        // Check for duplicate listener
        if listeners.contains_key(&listener_key) {
            log::warn!("⚠️  Listener already active for {} ({}), skipping duplicate start",
                device_type, port_name);
            return Ok(());
        }

        // Check if port is already in use by another integration
        let mut ports = get_active_ports().lock()
            .expect("ACTIVE_PORTS mutex poisoned - a thread panicked while holding the lock");
        if let Some(existing_key) = ports.get(&port_name) {
            log::error!("❌ Port {} is already in use by listener: {}", port_name, existing_key);
            return Err(format!("Port {} is already in use by another device integration", port_name));
        }

        // Reserve the port
        ports.insert(port_name.clone(), listener_key.clone());
        log::info!("📌 Reserved port {} for listener {}", port_name, listener_key);

        // Spawn thread while still holding locks to prevent race
        log::info!("🧵 Spawning listener thread for {} ({})", device_type, port_name);

        let handle = thread::spawn(move || {
        let mut retry_count: u32 = 0;

        log::info!("🔄 Listener thread started for {} ({})", device_type_clone, port_name_clone);

        loop {
            // Check for shutdown signal before attempting connection
            if shutdown_rx.try_recv().is_ok() {
                log::info!("🛑 Shutdown signal received for {} ({}), exiting thread",
                    device_type_clone, port_name_clone);
                break;
            }

            // Check if we've exceeded max retry attempts
            if retry_count > 0 && retry_count >= MAX_RETRY_ATTEMPTS {
                log::error!("❌ Max retry attempts ({}) reached for {} ({}), giving up",
                    MAX_RETRY_ATTEMPTS, device_type_clone, port_name_clone);
                update_connection_status(&app_handle, integration_id, &port_name_clone, &device_type_clone,
                    ConnectionState::Error, Some(format!("Max retries ({}) exceeded", MAX_RETRY_ATTEMPTS)), retry_count);
                break;
            }

            log::info!("🔌 Attempting connection to {} ({}) - Attempt {}/{}",
                device_type_clone, port_name_clone, retry_count + 1, MAX_RETRY_ATTEMPTS);

            // Update status to connecting
            update_connection_status(&app_handle, integration_id, &port_name_clone, &device_type_clone,
                ConnectionState::Connecting, None, retry_count);

            // Get protocol configuration for the device type
            let protocol = get_device_protocol(&device_type_clone);
            log::info!("📋 Using protocol for {} - Baud: {}, Start: {:?}, End: {:?}",
                device_type_clone, protocol.baud_rate, protocol.start_symbol, protocol.end_symbol);

            match handle_listening_serial(&port_name_clone, &app_handle, protocol, &device_type_clone,
                                        integration_id, &shutdown_rx) {
                Ok(_) => {
                    log::info!("✅ Listener for {} ({}) exited cleanly (shutdown or connection closed)",
                        device_type_clone, port_name_clone);
                    break; // Clean exit
                }
                Err(e) => {
                    // Categorize errors: fail fast on permanent errors, retry transient ones
                    // Covers both Unix and Windows error messages:
                    // - Unix: "Permission denied", "No such file or directory", "not found"
                    // - Windows: "Access is denied", "The system cannot find the file specified"
                    let is_permanent_error = e.contains("not found") || e.contains("Not found") ||
                                            e.contains("permission denied") || e.contains("Permission denied") ||
                                            e.contains("access denied") || e.contains("Access denied") ||
                                            e.contains("cannot find the file") || e.contains("Cannot find the file");

                    if is_permanent_error {
                        log::error!("💥 PERMANENT error on {} ({}): {} - giving up immediately",
                            device_type_clone, port_name_clone, e);
                        update_connection_status(&app_handle, integration_id, &port_name_clone, &device_type_clone,
                            ConnectionState::Error, Some(format!("Permanent error: {}", e)), retry_count);
                        break; // Don't retry permanent errors
                    }

                    retry_count += 1;
                    log::error!("❌ Transient error on {} ({}): {} (attempt {}/{})",
                        device_type_clone, port_name_clone, e, retry_count, MAX_RETRY_ATTEMPTS);
                    update_connection_status(&app_handle, integration_id, &port_name_clone, &device_type_clone,
                        ConnectionState::Error, Some(e.clone()), retry_count);
                }
            }

            // Calculate backoff delay with exponential backoff + jitter
            let delay = calculate_backoff_delay(retry_count);
            log::info!("⏳ Waiting {:?} before next connection attempt for {} ({})",
                delay, device_type_clone, port_name_clone);

            // Efficient backoff sleep using recv_timeout() - blocks until signal or timeout
            // This is more efficient than spinning with try_recv() + sleep()
            match shutdown_rx.recv_timeout(delay) {
                Ok(_) => {
                    // Shutdown signal received during backoff
                    log::info!("🛑 Shutdown signal received during backoff for {} ({}), exiting",
                        device_type_clone, port_name_clone);
                    return; // Exit thread immediately
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Backoff period complete, continue to next retry
                    log::debug!("   Backoff period elapsed for {} ({}), retrying connection",
                        device_type_clone, port_name_clone);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    // Sender dropped (stop_listen called), exit gracefully
                    log::info!("🛑 Shutdown sender disconnected during backoff for {} ({}), exiting",
                        device_type_clone, port_name_clone);
                    return;
                }
            }
        }

        log::info!("🧹 Cleaning up listener thread for {} ({})", device_type_clone, port_name_clone);

        // Remove from active ports
        let mut ports = get_active_ports().lock()
            .expect("ACTIVE_PORTS mutex poisoned - a thread panicked while holding the lock");
        ports.remove(&port_name_clone);
        log::info!("📍 Released port: {}", port_name_clone);

        // Clear connection status
        let mut statuses = get_connection_status().lock()
            .expect("CONNECTION_STATUS mutex poisoned - a thread panicked while holding the lock");
        statuses.remove(&format!("{}:{}", integration_id, port_name_clone));
        log::info!("🗑️  Cleared connection status for Integration ID: {}, Port: {}",
            integration_id, port_name_clone);
    });

        // Register thread handle while still holding locks (atomic with spawn)
        // This prevents race where another call could check and pass before we register
        listeners.insert(listener_key.clone(), ListenerThread {
            handle,
            shutdown_sender: shutdown_tx,
            integration_id,
            port_name: port_name.clone(),
        });
        log::info!("📝 Registered listener: {}. Total active listeners: {}", listener_key, listeners.len());
    }  // Locks released here - now safe for other calls to start_listen()

    Ok(())
}

/// Stop listening to a serial port with graceful shutdown
/// Sends shutdown signal and waits for thread to exit
/// Note: This will block until the thread exits. With proper shutdown signal checking,
/// threads should exit within ~100ms (the serial port read timeout).
pub fn stop_listen(port_name: &str, device_type: &str) {
    log::info!("🛑 Stopping device listener - Port: {}, Device Type: {}", port_name, device_type);
    let listener_key = format!("{}:{}", port_name, device_type);

    // Remove listener and get thread handle
    let listener_thread = {
        let mut listeners = get_active_listeners().lock()
            .expect("ACTIVE_LISTENERS mutex poisoned - a thread panicked while holding the lock");
        listeners.remove(&listener_key)
    };

    if let Some(listener) = listener_thread {
        log::info!("📨 Sending shutdown signal to listener: {}", listener_key);

        // Send shutdown signal (non-blocking)
        // Note: send() only fails if receiver is dropped, meaning thread already exited
        if let Err(_) = listener.shutdown_sender.send(()) {
            log::info!("ℹ️  Thread {} already exited (receiver dropped), proceeding with join", listener_key);
        }

        // Wait for thread to exit
        // Note: JoinHandle::join() blocks indefinitely, but our threads check shutdown
        // signals frequently (every 100ms in port.read() timeout), so exit should be fast
        log::info!("⏳ Waiting for thread {} to exit...", listener_key);
        let join_start = Instant::now();

        let thread_panicked = match listener.handle.join() {
            Ok(_) => {
                let elapsed = join_start.elapsed();
                log::info!("✅ Thread {} exited cleanly after {:?}", listener_key, elapsed);
                false
            }
            Err(e) => {
                log::error!("❌ Thread {} panicked: {:?}", listener_key, e);
                log::warn!("🧹 Thread panicked before cleanup - forcing cleanup now");
                true
            }
        };

        // CRITICAL: Always cleanup after join, even if thread exited cleanly
        // Rationale: If thread panicked before reaching cleanup code, resources leak
        // This cleanup is idempotent - if thread already cleaned up, remove() is a no-op
        {
            let mut ports = get_active_ports().lock()
                .expect("ACTIVE_PORTS mutex poisoned - a thread panicked while holding the lock");
            if ports.remove(&listener.port_name).is_some() {
                if thread_panicked {
                    log::info!("🔧 Force-released leaked port: {}", listener.port_name);
                } else {
                    log::debug!("   Port {} already cleaned up by thread", listener.port_name);
                }
            }
        }

        // Remove connection status (uses integration_id + port_name as key)
        {
            let mut statuses = get_connection_status().lock()
                .expect("CONNECTION_STATUS mutex poisoned - a thread panicked while holding the lock");
            let status_key = format!("{}:{}", listener.integration_id, listener.port_name);
            if statuses.remove(&status_key).is_some() {
                if thread_panicked {
                    log::info!("🔧 Force-cleared leaked connection status for Integration ID: {}, Port: {}",
                        listener.integration_id, listener.port_name);
                } else {
                    log::debug!("   Connection status {} already cleaned up by thread", status_key);
                }
            }
        }

        log::info!("📝 Stopped listener: {}", listener_key);
    } else {
        log::warn!("⚠️  Listener {} was not active, nothing to stop", listener_key);
    }
}

/// Handle incoming device data: parse and emit to frontend
fn handle_device_data(app_handle: &AppHandle, data: &[u8], device_name: &str, device_type: &str) {
    log::info!("📥 Received device data - Device: {} ({}), Data size: {} bytes",
        device_name, device_type, data.len());

    // Parse the device data based on device type
    let result = match device_type {
        "healvet_hv_fia_3000" => {
            log::info!("🔍 Parsing Healvet HV-FIA-3000 data from {}", device_name);
            DeviceParserService::parse_healvet_serial(device_name, data, "serial_port")
        }
        "mnchip_pointcare_pcr_v1" => {
            log::info!("🔍 Parsing MNCHIP Pointcare PCR V1 data from {}", device_name);
            DeviceParserService::parse_mnchip_data(device_name, "serial_data", data, "serial_port")
        }
        _ => {
            log::error!("❌ Unknown device type: {} (from {})", device_type, device_name);
            return;
        }
    };

    match result {
        Ok(device_data) => {
            log::info!("✅ Successfully parsed device data from {} ({})", device_name, device_type);
            log::info!("   📋 Patient ID: {:?}, Sample ID: {:?}, File: {}",
                device_data.patient_identifier,
                device_data.test_results.get("SNO")
                    .or_else(|| device_data.test_results.get("ID1"))
                    .or_else(|| device_data.test_results.get("sample_id")),
                device_data.original_file_name);

            // Emit to frontend
            match app_handle.emit_all("device-data-received", &device_data) {
                Ok(_) => {
                    log::info!("📡 Emitted device-data-received event to frontend for {} ({})",
                        device_name, device_type);
                }
                Err(e) => {
                    log::error!("❌ Failed to emit device data to frontend: {}", e);
                }
            }

            // Save file and track access (async)
            let app_handle_track = app_handle.clone();
            let file_name = device_data.original_file_name.clone();
            let file_data_vec = device_data.file_data.clone();
            let device_type_str = device_data.device_type.clone();
            let device_name_str = device_data.device_name.clone();
            let mime_type = device_data.mime_type.clone();

            log::info!("💾 Starting async file save and tracking for {} from {} ({})",
                file_name, device_name_str, device_type_str);

            tauri::async_runtime::spawn(async move {
                // Get database pool from Tauri state
                if let Some(pool) = app_handle_track.try_state::<DatabasePool>() {
                    log::info!("   ✅ Database pool retrieved for file tracking");

                    // Save file to storage
                    match FileStorageService::save_device_file(&app_handle_track, &file_name, &file_data_vec) {
                        Ok((file_id, file_path)) => {
                            log::info!("   ✅ File saved successfully - ID: {}, Path: {}", file_id, file_path);

                            // Track file access
                            let pool_guard = pool.lock().await;
                            let file_size = file_data_vec.len() as i64;
                            log::info!("   📊 Recording file access - Size: {} bytes, Type: {}", file_size, mime_type);

                            if let Err(e) = record_device_file_access_internal(
                                &*pool_guard,
                                file_id,
                                file_name.clone(),
                                file_path,
                                Some(file_size),
                                Some(mime_type),
                                device_type_str,
                                device_name_str,
                                Some("serial_port".to_string()),
                            ).await {
                                log::error!("   ❌ Failed to record file access for {}: {}", file_name, e);
                            } else {
                                log::info!("   ✅ File access recorded successfully for {}", file_name);
                            }
                        }
                        Err(e) => {
                            log::error!("   ❌ Failed to save device file {}: {}", file_name, e);
                        }
                    }
                } else {
                    log::error!("   ❌ Failed to get database pool from app state for file tracking");
                }
            });
        }
        Err(e) => {
            log::error!("❌ Failed to parse device data from {} ({}): {}", device_name, device_type, e);
        }
    }
}

fn handle_listening_serial(
    port_name: &str,
    app_handle: &AppHandle,
    protocol: DeviceProtocol,
    device_type: &str,
    integration_id: i64,
    shutdown_rx: &mpsc::Receiver<()>,
) -> Result<(), String> {
    log::info!("🔌 Opening serial port - Port: {}, Device: {}, Integration ID: {}",
        port_name, device_type, integration_id);

    // Detect if this is a PTY device (macOS virtual serial port workaround)
    // PTY devices on macOS (created by socat, etc.) need baud_rate=0 to avoid ENOTTY error
    // See: https://github.com/serialport/serialport-rs/issues/22
    let is_pty = port_name.contains("/dev/tty") || port_name.contains("/tmp/");
    let baud_rate = if cfg!(target_os = "macos") && is_pty {
        log::info!("   🍎 macOS PTY device detected, using baud_rate=0 workaround");
        0
    } else {
        protocol.baud_rate
    };

    log::info!("   ⚙️  Serial port configuration - Baud: {}, Data bits: 8, Parity: None, Stop bits: 1",
        baud_rate);

    let mut port = serialport::new(port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .open()
        .map_err(|e| {
            log::error!("❌ Failed to open serial port {} for {} (Integration ID: {}): {}",
                port_name, device_type, integration_id, e);
            format!("Failed to open port: {}", e)
        })?;

    log::info!("✅ Serial port {} opened successfully for {} (Integration ID: {})",
        port_name, device_type, integration_id);

    // Successfully connected - update status
    update_connection_status(app_handle, integration_id, port_name, device_type, ConnectionState::Connected, None, 0);

    let mut data: Vec<u8> = Vec::new();
    let mut buffer = vec![0; 1024];
    let mut started: bool = protocol.start_symbol.is_none(); // If no start symbol, always "started"
    let mut consecutive_end_symbols = 0; // For devices that use "EE" as end marker
    let mut total_bytes_read = 0u64;
    let mut read_count = 0u64;

    log::info!("📖 Starting serial port read loop for {} ({})", device_type, port_name);
    log::info!("   🔍 Protocol - Start symbol: {:?}, End symbol: {:?}",
        protocol.start_symbol, protocol.end_symbol);

    loop {
        // Check for shutdown signal using try_recv (non-blocking)
        // Using try_recv instead of recv_timeout for better responsiveness
        if shutdown_rx.try_recv().is_ok() {
            log::info!("🛑 Shutdown signal received in read loop for {} ({}), closing port", device_type, port_name);
            drop(port); // Explicitly close the port
            return Ok(()); // Clean shutdown
        }

        match port.read(&mut buffer) {
            Ok(bytes_read) if bytes_read > 0 => {
                read_count += 1;
                total_bytes_read += bytes_read as u64;

                if read_count % 100 == 0 {
                    log::info!("📊 Read statistics for {} ({}): {} reads, {} total bytes",
                        device_type, port_name, read_count, total_bytes_read);
                }
                for i in 0..bytes_read {
                    if buffer[i] == protocol.end_symbol && started {
                        consecutive_end_symbols += 1;

                        // Healvet uses "EE" (two E's) as end marker
                        if protocol.end_symbol == b'E' && consecutive_end_symbols == 2 {
                            log::info!("📦 Complete message received from {} ({}) - Size: {} bytes (Healvet protocol)",
                                device_type, port_name, data.len());
                            // Parse and emit device data
                            handle_device_data(&app_handle, &data, &port_name, &device_type);

                            data.clear();
                            consecutive_end_symbols = 0;
                            // Reset started state based on whether we have a start symbol
                            started = protocol.start_symbol.is_none();
                        }
                        // Pointcare (MNCHIP) uses "\r\r" (two carriage returns) as end marker
                        else if protocol.end_symbol == 0x0D && consecutive_end_symbols == 2 {
                            // Only process if we have actual data (not just the \r characters)
                            if !data.is_empty() {
                                log::info!("📦 Complete message received from {} ({}) - Size: {} bytes (Pointcare protocol)",
                                    device_type, port_name, data.len());
                                // Parse and emit device data
                                handle_device_data(&app_handle, &data, &port_name, &device_type);

                                data.clear();
                            }
                            consecutive_end_symbols = 0;
                            started = protocol.start_symbol.is_none();
                        }
                        else if protocol.end_symbol == 0x0D && consecutive_end_symbols == 1 {
                            // First \r for Pointcare - add it to data as line delimiter
                            data.push(buffer[i]);
                        }
                        else if protocol.end_symbol != b'E' && protocol.end_symbol != 0x0D {
                            log::info!("📦 Complete message received from {} ({}) - Size: {} bytes (Generic protocol)",
                                device_type, port_name, data.len());
                            // Single end symbol (like newline) for other devices
                            // Parse and emit device data
                            handle_device_data(&app_handle, &data, &port_name, &device_type);

                            data.clear();
                            consecutive_end_symbols = 0;
                            started = protocol.start_symbol.is_none();
                        }
                        // else: still accumulating end symbols (E's for Healvet)
                    }
                    else if let Some(start_byte) = protocol.start_symbol {
                        consecutive_end_symbols = 0; // Reset counter
                        if buffer[i] == start_byte && !started {
                            log::info!("🎯 Start symbol detected for {} ({}), beginning data collection",
                                device_type, port_name);
                            started = true;
                        } else if started {
                            data.push(buffer[i])
                        }
                    } else if started {
                        consecutive_end_symbols = 0; // Reset counter
                        // No start symbol defined, accumulate all data
                        data.push(buffer[i])
                    }
                }
            }
            Ok(_) => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::BrokenPipe ||
            e.kind() == std::io::ErrorKind::ConnectionAborted ||
            e.kind() == std::io::ErrorKind::Interrupted ||
            e.kind() == std::io::ErrorKind::ConnectionRefused ||
            e.kind() == std::io::ErrorKind::NotFound ||
            e.kind() == std::io::ErrorKind::PermissionDenied => {
                let err_msg = format!("Connection lost: {}", e);
                log::error!("💥 Fatal error on port {} for {} (Integration ID: {}): {:?} - {}",
                    port_name, device_type, integration_id, e.kind(), e);
                log::error!("   Connection will be reestablished after 5 seconds");
                return Err(err_msg);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::Other => {
                let err_str = e.to_string().to_lowercase();
                if err_str.contains("device") || err_str.contains("failed") {
                    log::error!("💥 Device error on port {} for {} (Integration ID: {}): {}",
                        port_name, device_type, integration_id, e);
                    let err_msg = format!("Device error: {}", e);
                    log::error!("   Connection will be reestablished after 5 seconds");
                    return Err(err_msg);
                }
            }
            Err(e) => {
                log::warn!("⚠️  Transient error reading port {} for {} (Integration ID: {}): {:?} - {} (continuing)",
                    port_name, device_type, integration_id, e.kind(), e);
            }
        }
    }
    // Note: Loop never exits normally - all exits are via return statements above
}
