export type DeviceType =
  | 'exigo_eos_vet'
  | 'healvet_hv_fia_3000'
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

// Helper function to get display name for device type
export function getDeviceTypeDisplayName(deviceType: DeviceType): string {
  switch (deviceType) {
    case 'exigo_eos_vet':
      return 'Exigo Eos Vet';
    case 'healvet_hv_fia_3000':
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
