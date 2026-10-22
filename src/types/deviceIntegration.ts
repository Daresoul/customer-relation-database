export type DeviceType =
  | 'exigo_eos_vet'
  | 'healvet_hv_fia3000'
  | 'mnchip_pointcare_chemistry'
  | 'mnchip_pcr_analyzer';

export type ConnectionType =
  | 'file_watch'
  | 'serial_port'
  | 'hl7_tcp';

export interface DeviceIntegration {
  id: number;
  name: string;
  deviceType: DeviceType;
  connectionType: ConnectionType;

  // File watching settings
  watchDirectory?: string;
  filePattern?: string;

  // Serial port settings
  serialPortName?: string;
  serialBaudRate?: number;

  // HL7 TCP settings
  tcpHost?: string;
  tcpPort?: number;

  // Status and metadata
  enabled: boolean;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateDeviceIntegrationInput {
  name: string;
  deviceType: DeviceType;
  connectionType: ConnectionType;

  // File watching settings
  watchDirectory?: string;
  filePattern?: string;

  // Serial port settings
  serialPortName?: string;
  serialBaudRate?: number;

  // HL7 TCP settings
  tcpHost?: string;
  tcpPort?: number;
}

export interface UpdateDeviceIntegrationInput {
  name?: string;
  connectionType?: ConnectionType;

  // File watching settings
  watchDirectory?: string;
  filePattern?: string;

  // Serial port settings
  serialPortName?: string;
  serialBaudRate?: number;

  // HL7 TCP settings
  tcpHost?: string;
  tcpPort?: number;

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
  error_kind?: DeviceErrorKind | null;
  retry_count: number;
  next_retry?: string;
  last_result_at?: string | null;
  last_byte_at?: string | null;
}

// Why a device or folder can't be reached (plain-language text in i18n `devices:health.kinds`)
export type DeviceErrorKind =
  | 'port_missing'
  | 'port_busy'
  | 'access_denied'
  | 'disconnected'
  | 'folder_missing'
  | 'folder_lost'
  | 'not_a_folder'
  | 'unknown';

// Payload of the `device-event` Tauri event
export type DeviceEventKind = 'parse_failed' | 'empty_result' | 'cut_off' | 'save_failed' | 'folder_lost';

export interface DeviceEvent {
  integrationId?: number | null;
  deviceName: string;
  deviceType: string;
  kind: DeviceEventKind;
  messageKey: string;
  detail?: string | null;
  fileName?: string | null;
  fileId?: string | null;
  at: string;
}

// File watcher status types
export type FileWatcherState = 'Watching' | 'Error' | 'Stopped';

export interface FileWatcherStatus {
  integration_id: number;
  name: string;
  watch_directory: string;
  status: FileWatcherState;
  last_error?: string;
  error_kind?: DeviceErrorKind | null;
  files_processed: number;
  last_result_at?: string | null;
}

// Helper function to get display name for device type
export function getDeviceTypeDisplayName(deviceType: DeviceType): string {
  switch (deviceType) {
    case 'exigo_eos_vet':
      return 'Exigo Eos Vet';
    case 'healvet_hv_fia3000':
      return 'Healvet HV-FIA 3000';
    case 'mnchip_pointcare_chemistry':
      return 'MNCHIP PointCare Chemistry';
    case 'mnchip_pcr_analyzer':
      return 'MNCHIP PCR Analyzer';
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
