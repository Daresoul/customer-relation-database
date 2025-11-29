export type DeviceType =
  | 'exigo_eos_vet'
  | 'healvet_hv_fia3000'
  | 'mnchip_pointcare_pcr_v1';

export type ConnectionType =
  | 'file_watch'
  | 'serial_port'
  | 'hl7_tcp';

export interface DeviceIntegration {
  id: number;
  name: string;
  device_type: DeviceType;
  connection_type: ConnectionType;

  // File watching settings
  watch_directory?: string;
  file_pattern?: string;

  // Serial port settings
  serial_port_name?: string;
  serial_baud_rate?: number;

  // HL7 TCP settings
  tcp_host?: string;
  tcp_port?: number;

  // Status and metadata
  enabled: boolean;
  last_connected_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CreateDeviceIntegrationInput {
  name: string;
  device_type: DeviceType;
  connection_type: ConnectionType;

  // File watching settings
  watch_directory?: string;
  file_pattern?: string;

  // Serial port settings
  serial_port_name?: string;
  serial_baud_rate?: number;

  // HL7 TCP settings
  tcp_host?: string;
  tcp_port?: number;
}

export interface UpdateDeviceIntegrationInput {
  name?: string;
  connection_type?: ConnectionType;

  // File watching settings
  watch_directory?: string;
  file_pattern?: string;

  // Serial port settings
  serial_port_name?: string;
  serial_baud_rate?: number;

  // HL7 TCP settings
  tcp_host?: string;
  tcp_port?: number;

  enabled?: boolean;
}

// Connection status types for serial ports
export type ConnectionState = 'Connected' | 'Disconnected' | 'Connecting' | 'Error';

export interface DeviceConnectionStatus {
  integration_id: number;
  port_name: string;
  device_type: string;
  status: ConnectionState;
  last_connected?: string;
  last_error?: string;
  retry_count: number;
  next_retry?: string;
}

// File watcher status types
export type FileWatcherState = 'Watching' | 'Error' | 'Stopped';

export interface FileWatcherStatus {
  integration_id: number;
  name: string;
  watch_directory: string;
  status: FileWatcherState;
  last_error?: string;
  files_processed: number;
}

// Helper function to get display name for device type
export function getDeviceTypeDisplayName(deviceType: DeviceType): string {
  switch (deviceType) {
    case 'exigo_eos_vet':
      return 'Exigo Eos Vet';
    case 'healvet_hv_fia3000':
      return 'Healvet HV-FIA 3000';
    case 'mnchip_pointcare_pcr_v1':
      return 'MNCHIP PointCare PCR V1';
  }
}

// Helper function to get display name for connection type
export function getConnectionTypeDisplayName(connectionType: ConnectionType): string {
  switch (connectionType) {
    case 'file_watch':
      return 'File Watch';
    case 'serial_port':
      return 'Serial Port';
    case 'hl7_tcp':
      return 'HL7 TCP';
  }
}

// Serial Port and USB Device Types
export interface UsbInfo {
  vid: number;
  pid: number;
  serial_number?: string;
  manufacturer?: string;
  product?: string;
  path?: string;
  device_name?: string; // Friendly name from USB ID database (e.g., "FTDI FT232 USB-Serial")
}

export type PortType =
  | { USB: UsbInfo }
  | { PCI: null }
  | { BluetoothPort: null }
  | { BuiltInPort: null }
  | { HIDDevice: UsbInfo }
  | { Unknown: null };

export interface PortInfo {
  port_name: string;
  port_type: PortType;
}

// Helper to format USB device display name (for dropdown/list)
export function formatUsbDeviceDisplayName(port: PortInfo): string {
  if ('USB' in port.port_type || 'HIDDevice' in port.port_type) {
    const usb = 'USB' in port.port_type ? port.port_type.USB : port.port_type.HIDDevice;
    if (usb.device_name) {
      return `${port.port_name} - ${usb.device_name}`;
    }
  }
  return port.port_name;
}

// Helper to format USB device tooltip (detailed info on hover)
export function formatUsbDeviceTooltip(port: PortInfo): string | undefined {
  if ('USB' in port.port_type || 'HIDDevice' in port.port_type) {
    const usb = 'USB' in port.port_type ? port.port_type.USB : port.port_type.HIDDevice;
    const parts: string[] = [];
    parts.push(`VID: 0x${usb.vid.toString(16).padStart(4, '0')}`);
    parts.push(`PID: 0x${usb.pid.toString(16).padStart(4, '0')}`);
    if (usb.serial_number) parts.push(`Serial: ${usb.serial_number}`);
    if (usb.manufacturer) parts.push(`Manufacturer: ${usb.manufacturer}`);
    if (usb.product) parts.push(`Product: ${usb.product}`);
    return parts.join('\n');
  }
  return undefined;
}
