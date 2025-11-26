use std::thread;
use std::time::Duration;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use serialport::{available_ports, SerialPortType, UsbPortInfo};
use serde::Serialize;
use hidapi::HidApi;
use tauri::{AppHandle, Manager};
use crate::services::device_input::PortType::HIDDevice;
use crate::services::device_parser::DeviceParserService;

// Track active listeners to prevent duplicates
static ACTIVE_LISTENERS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn get_active_listeners() -> &'static Mutex<HashSet<String>> {
    ACTIVE_LISTENERS.get_or_init(|| Mutex::new(HashSet::new()))
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
    HIDDevice(UsbInfo)
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

pub fn scan_serial_ports() -> Result<Vec<PortInfo>, String> {
    let mut ports = vec![];
    let mut seen_ports = std::collections::HashSet::new();

    // 1. Scan standard serial ports using serialport crate
    let available_ports = available_ports().map_err(|_| "Failed to list available ports".to_string())?;

    for port in available_ports {
        seen_ports.insert(port.port_name.clone());
        let port_info = PortInfo {
            port_name: port.port_name,
            port_type: PortType::convert_serial_port(port.port_type),
        };
        ports.push(port_info);
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
                            seen_ports.insert(port_name.clone());
                            ports.push(PortInfo {
                                port_name,
                                port_type: PortType::SerialUnknown, // Virtual/PTY port
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
pub fn start_listen(
    app_handle: AppHandle,
    port_name: String,
    device_type: String,
) -> Result<(), String> {
    // Check if listener already exists for this port
    let listener_key = format!("{}:{}", port_name, device_type);

    {
        let mut listeners = get_active_listeners().lock().unwrap();
        if listeners.contains(&listener_key) {
            println!("⚠️  Listener already active for device '{}' on port '{}', skipping duplicate", device_type, port_name);
            return Ok(());
        }
        listeners.insert(listener_key.clone());
        println!("✅ Registered listener: {}", listener_key);
    }

    // Get protocol configuration for the device type
    let protocol = get_device_protocol(&device_type);

    println!("🎧 Starting listener for device type '{}' on port '{}'", device_type, port_name);
    println!("   Protocol: baud={}, start={:?}, end=0x{:02X}",
        protocol.baud_rate,
        protocol.start_symbol.map(|b| format!("0x{:02X}", b)),
        protocol.end_symbol
    );

    let port_name_clone = port_name.clone();
    let device_type_clone = device_type.clone();
    thread::spawn(move || {
        if let Err(e) = handle_listening_serial(port_name, app_handle, protocol, device_type_clone) {
            eprintln!("❌ Listener error: {}", e);
        }

        // Remove from active listeners when thread exits
        let mut listeners = get_active_listeners().lock().unwrap();
        listeners.remove(&listener_key);
        println!("🔌 Unregistered listener: {}", listener_key);
    });

    Ok(())
}

/// Handle incoming device data: parse and emit to frontend
fn handle_device_data(app_handle: &AppHandle, data: &[u8], device_name: &str, device_type: &str) {
    println!("📦 [DEBUG] Parsing device data ({} bytes) for device type '{}'...", data.len(), device_type);

    // Parse the device data based on device type
    let result = match device_type {
        "healvet_hv_fia_3000" => {
            DeviceParserService::parse_healvet_serial(device_name, data, "serial_port")
        }
        "mnchip_pointcare_pcr_v1" => {
            DeviceParserService::parse_mnchip_data(device_name, "serial_data", data, "serial_port")
        }
        _ => {
            eprintln!("❌ [ERROR] Unknown device type: {}", device_type);
            return;
        }
    };

    match result {
        Ok(device_data) => {
            println!("✅ [DEBUG] Successfully parsed device data");
            println!("   Device: {}", device_data.device_name);
            if let Some(ref patient_id) = device_data.patient_identifier {
                println!("   Patient ID: {}", patient_id);
            }

            // Emit to frontend
            println!("📤 [DEBUG] Emitting 'device-data-received' event...");
            if let Err(e) = app_handle.emit_all("device-data-received", &device_data) {
                eprintln!("❌ [ERROR] Failed to emit device data: {}", e);
            } else {
                println!("✅ [DEBUG] Device data emitted successfully!");
            }
        }
        Err(e) => {
            eprintln!("❌ [ERROR] Failed to parse device data: {}", e);
            eprintln!("   Raw data: {}", String::from_utf8_lossy(data));
        }
    }
}

fn handle_listening_serial(port_name: String, app_handle: AppHandle, protocol: DeviceProtocol, device_type: String) -> Result<(), String> {
    println!("🔧 [DEBUG] Opening serial port: {}", port_name);

    // Detect if this is a PTY device (macOS virtual serial port workaround)
    // PTY devices on macOS (created by socat, etc.) need baud_rate=0 to avoid ENOTTY error
    // See: https://github.com/serialport/serialport-rs/issues/22
    let is_pty = port_name.contains("/dev/tty") || port_name.contains("/tmp/");
    let baud_rate = if cfg!(target_os = "macos") && is_pty {
        println!("🔧 [DEBUG] Detected PTY device on macOS, using baud_rate=0 to avoid ENOTTY");
        0
    } else {
        protocol.baud_rate
    };

    println!("🔧 [DEBUG] Port settings: baud={}, timeout=100ms", baud_rate);

    let mut port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .open()
        .map_err(|e| {
            eprintln!("❌ [ERROR] Failed to open port {}: {}", port_name, e);
            eprintln!("❌ [ERROR] Error details: {:?}", e);
            format!("Failed to open port: {}", e)
        })?;

    println!("✅ [DEBUG] Serial port {} opened successfully!", port_name);
    println!("🎧 [DEBUG] Now listening for data on {}...", port_name);

    let mut data: Vec<u8> = Vec::new();
    let mut buffer = vec![0; 1024];
    let mut started: bool = protocol.start_symbol.is_none(); // If no start symbol, always "started"
    let mut consecutive_end_symbols = 0; // For devices that use "EE" as end marker
    let mut read_count = 0;

    loop {
        match port.read(&mut buffer) {
            Ok(bytes_read) if bytes_read > 0 => {
                read_count += 1;
                println!("📥 [DEBUG] Read #{}: {} bytes from {}", read_count, bytes_read, port_name);
                println!("📥 [DEBUG] Raw bytes: {:?}", &buffer[..bytes_read]);
                println!("📥 [DEBUG] As string: {:?}", String::from_utf8_lossy(&buffer[..bytes_read]));
                for i in 0..bytes_read {
                    if buffer[i] == protocol.end_symbol && started {
                        consecutive_end_symbols += 1;

                        // Healvet uses "EE" (two E's) as end marker
                        if protocol.end_symbol == b'E' && consecutive_end_symbols == 2 {
                            let message = String::from_utf8_lossy(&data).to_string();
                            println!("📨 [SUCCESS] Received complete Healvet message ({} bytes)", data.len());
                            println!("📨 [SUCCESS] Raw data: {}", message);

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
                                let message = String::from_utf8_lossy(&data).to_string();
                                println!("📨 [SUCCESS] Received complete Pointcare HL7 message ({} bytes)", data.len());
                                println!("📨 [SUCCESS] Raw data: {}", message.replace('\r', "\\r"));

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
                            let message = String::from_utf8_lossy(&data).to_string();
                            println!("📨 [SUCCESS] Received message ({} bytes): {}", data.len(), message);

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
                eprintln!("❌ [ERROR] Fatal error on port {}: {:?} - {}", port_name, e.kind(), e);
                app_handle.emit_all("rust-error", e.to_string()).unwrap();
                break;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::Other => {
                let err_str = e.to_string().to_lowercase();
                if err_str.contains("device") || err_str.contains("failed") {
                    eprintln!("❌ [ERROR] Device error on port {}: {}", port_name, e);
                    app_handle.emit_all("rust-error", e.to_string()).unwrap();
                    break;
                }
            }
            Err(err) => {
                eprintln!("⚠️  [WARN] Unexpected error reading from serial port {}: {}", port_name, err);
                app_handle.emit_all("rust-error", err.to_string()).unwrap();
            }
        }
    }
    println!("📡 [DEBUG] Serial port listener stopped for {}", port_name);
    Ok(())
}
