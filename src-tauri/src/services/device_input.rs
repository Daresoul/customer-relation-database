use std::thread;
use std::time::Duration;
use std::collections::{HashSet, HashMap};
use std::sync::{Mutex, OnceLock};
use serialport::{available_ports, SerialPortType, UsbPortInfo};
use serde::{Serialize, Deserialize};
use hidapi::HidApi;
use tauri::{AppHandle, Manager};
use chrono::Utc;
use crate::services::device_input::PortType::HIDDevice;
use crate::services::device_parser::DeviceParserService;
use crate::services::file_storage::FileStorageService;
use crate::commands::file_history::record_device_file_access_internal;
use crate::database::connection::DatabasePool;

// Track active listeners to prevent duplicates
static ACTIVE_LISTENERS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

// Track connection status for each device
static CONNECTION_STATUS: OnceLock<Mutex<HashMap<String, DeviceConnectionStatus>>> = OnceLock::new();

fn get_active_listeners() -> &'static Mutex<HashSet<String>> {
    ACTIVE_LISTENERS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn get_connection_status() -> &'static Mutex<HashMap<String, DeviceConnectionStatus>> {
    CONNECTION_STATUS.get_or_init(|| Mutex::new(HashMap::new()))
}

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
    let now = Utc::now();
    let next_retry = if status == ConnectionState::Disconnected || status == ConnectionState::Error {
        Some((now + chrono::Duration::seconds(5)).to_rfc3339())
    } else {
        None
    };

    let connection_status = DeviceConnectionStatus {
        integration_id,
        port_name: port_name.to_string(),
        device_type: device_type.to_string(),
        status: status.clone(),
        last_connected: if status == ConnectionState::Connected { Some(now.to_rfc3339()) } else { None },
        last_error: error,
        retry_count,
        next_retry,
    };

    // Store in global state
    {
        let mut statuses = get_connection_status().lock().unwrap();
        statuses.insert(format!("{}:{}", integration_id, port_name), connection_status.clone());
    }

    // Emit to frontend
    let _ = app_handle.emit_all("device-connection-status", &connection_status);
}

/// Get all connection statuses
pub fn get_all_connection_statuses() -> Vec<DeviceConnectionStatus> {
    let statuses = get_connection_status().lock().unwrap();
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
}

impl UsbInfo {
    fn convert_usb_port_info(usb_port_info: UsbPortInfo) -> UsbInfo {
        UsbInfo {
            vid: usb_port_info.vid,
            pid: usb_port_info.pid,
            serial_number: usb_port_info.serial_number,
            manufacturer: usb_port_info.manufacturer,
            product: usb_port_info.product,
            path: None
        }
    }
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
        // Determine port type based on device path pattern
        let port_type = if device_path.starts_with("\\Device\\Serial") {
            // Built-in motherboard serial port (e.g., \Device\Serial0 -> COM1)
            PortType::BuiltInPort
        } else if device_path.contains("FTDIBUS") || device_path.contains("VCP")
                || device_path.contains("USBSER") || device_path.contains("USB#VID_") {
            // USB serial device (FTDI, generic USB-Serial, etc.)
            // Probably disconnected since serialport crate didn't find it with full metadata
            PortType::DisconnectedPort(device_path.clone())
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
        path: Some(device.path().to_string_lossy().to_string())
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

/// Start listening to a serial port with the given device protocol
/// With auto-reconnect on failure (5-second intervals)
pub fn start_listen(
    app_handle: AppHandle,
    port_name: String,
    device_type: String,
    integration_id: i64,
) -> Result<(), String> {
    // Check if listener already exists for this port
    let listener_key = format!("{}:{}", port_name, device_type);

    {
        let mut listeners = get_active_listeners().lock().unwrap();
        if listeners.contains(&listener_key) {
            return Ok(());
        }
        listeners.insert(listener_key.clone());
    }

    let device_type_clone = device_type.clone();
    let port_name_clone = port_name.clone();

    thread::spawn(move || {
        let mut retry_count: u32 = 0;

        loop {
            // Update status to connecting
            update_connection_status(&app_handle, integration_id, &port_name_clone, &device_type_clone, ConnectionState::Connecting, None, retry_count);

            // Get protocol configuration for the device type
            let protocol = get_device_protocol(&device_type_clone);

            match handle_listening_serial(&port_name_clone, &app_handle, protocol, &device_type_clone, integration_id) {
                Ok(_) => {
                    // Normal exit (shouldn't happen in normal operation)
                    update_connection_status(&app_handle, integration_id, &port_name_clone, &device_type_clone, ConnectionState::Disconnected, Some("Connection closed".to_string()), retry_count);
                }
                Err(e) => {
                    retry_count += 1;
                    update_connection_status(&app_handle, integration_id, &port_name_clone, &device_type_clone, ConnectionState::Error, Some(e.clone()), retry_count);
                    eprintln!("Listener error on {}: {} (retry #{})", port_name_clone, e, retry_count);
                }
            }

            // Check if we should stop retrying (listener was removed)
            {
                let listeners = get_active_listeners().lock().unwrap();
                if !listeners.contains(&listener_key) {
                    break;
                }
            }

            // Wait 5 seconds before retrying
            thread::sleep(Duration::from_secs(5));
        }

        // Remove from active listeners when thread exits
        let mut listeners = get_active_listeners().lock().unwrap();
        listeners.remove(&listener_key);

        // Clear connection status
        let mut statuses = get_connection_status().lock().unwrap();
        statuses.remove(&format!("{}:{}", integration_id, port_name_clone));
    });

    Ok(())
}

/// Stop listening to a serial port
pub fn stop_listen(port_name: &str, device_type: &str) {
    let listener_key = format!("{}:{}", port_name, device_type);
    let mut listeners = get_active_listeners().lock().unwrap();
    listeners.remove(&listener_key);
}

/// Handle incoming device data: parse and emit to frontend
fn handle_device_data(app_handle: &AppHandle, data: &[u8], device_name: &str, device_type: &str) {
    // Parse the device data based on device type
    let result = match device_type {
        "healvet_hv_fia_3000" => {
            DeviceParserService::parse_healvet_serial(device_name, data, "serial_port")
        }
        "mnchip_pointcare_pcr_v1" => {
            DeviceParserService::parse_mnchip_data(device_name, "serial_data", data, "serial_port")
        }
        _ => {
            eprintln!("Unknown device type: {}", device_type);
            return;
        }
    };

    match result {
        Ok(device_data) => {
            // Emit to frontend
            if let Err(e) = app_handle.emit_all("device-data-received", &device_data) {
                eprintln!("Failed to emit device data: {}", e);
            }

            // Save file and track access (async)
            let app_handle_track = app_handle.clone();
            let file_name = device_data.original_file_name.clone();
            let file_data_vec = device_data.file_data.clone();
            let device_type_str = device_data.device_type.clone();
            let device_name_str = device_data.device_name.clone();
            let mime_type = device_data.mime_type.clone();

            tauri::async_runtime::spawn(async move {
                // Get database pool from Tauri state
                if let Some(pool) = app_handle_track.try_state::<DatabasePool>() {
                    // Save file to storage
                    match FileStorageService::save_device_file(&app_handle_track, &file_name, &file_data_vec) {
                        Ok((file_id, file_path)) => {
                            // Track file access
                            let pool_guard = pool.lock().await;
                            let file_size = file_data_vec.len() as i64;
                            if let Err(e) = record_device_file_access_internal(
                                &*pool_guard,
                                file_id,
                                file_name,
                                file_path,
                                Some(file_size),
                                Some(mime_type),
                                device_type_str,
                                device_name_str,
                                Some("serial_port".to_string()),
                            ).await {
                                eprintln!("Failed to record file access: {}", e);
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to save device file: {}", e);
                        }
                    }
                } else {
                    eprintln!("Failed to get database pool from app state");
                }
            });
        }
        Err(e) => {
            eprintln!("Failed to parse device data: {}", e);
        }
    }
}

fn handle_listening_serial(port_name: &str, app_handle: &AppHandle, protocol: DeviceProtocol, device_type: &str, integration_id: i64) -> Result<(), String> {
    // Detect if this is a PTY device (macOS virtual serial port workaround)
    // PTY devices on macOS (created by socat, etc.) need baud_rate=0 to avoid ENOTTY error
    // See: https://github.com/serialport/serialport-rs/issues/22
    let is_pty = port_name.contains("/dev/tty") || port_name.contains("/tmp/");
    let baud_rate = if cfg!(target_os = "macos") && is_pty {
        0
    } else {
        protocol.baud_rate
    };

    let mut port = serialport::new(port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .open()
        .map_err(|e| {
            eprintln!("Failed to open port {}: {}", port_name, e);
            format!("Failed to open port: {}", e)
        })?;

    // Successfully connected - update status
    update_connection_status(app_handle, integration_id, port_name, device_type, ConnectionState::Connected, None, 0);

    let mut data: Vec<u8> = Vec::new();
    let mut buffer = vec![0; 1024];
    let mut started: bool = protocol.start_symbol.is_none(); // If no start symbol, always "started"
    let mut consecutive_end_symbols = 0; // For devices that use "EE" as end marker

    loop {
        match port.read(&mut buffer) {
            Ok(bytes_read) if bytes_read > 0 => {
                for i in 0..bytes_read {
                    if buffer[i] == protocol.end_symbol && started {
                        consecutive_end_symbols += 1;

                        // Healvet uses "EE" (two E's) as end marker
                        if protocol.end_symbol == b'E' && consecutive_end_symbols == 2 {
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
                eprintln!("Fatal error on port {}: {}", port_name, e);
                return Err(err_msg);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::Other => {
                let err_str = e.to_string().to_lowercase();
                if err_str.contains("device") || err_str.contains("failed") {
                    let err_msg = format!("Device error: {}", e);
                    eprintln!("Device error on port {}: {}", port_name, e);
                    return Err(err_msg);
                }
            }
            Err(_err) => {
                // Transient errors - continue reading
            }
        }
    }
    Ok(())
}
