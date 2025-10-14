use serialport::{available_ports, SerialPortType, UsbPortInfo};
use serde::Serialize;
use hidapi::HidApi;
use crate::services::device_input::PortType::HIDDevice;

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

pub fn scan_serial_ports() -> Result<Vec<PortInfo>, String> {
    let mut ports = vec![];

    let available_ports = available_ports().map_err(|_| "Failed to list available ports".to_string())?;

    for port in available_ports {
        let port_info = PortInfo {
            port_name: port.port_name,
            port_type: PortType::convert_serial_port(port.port_type),
        };
        ports.push(port_info);
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