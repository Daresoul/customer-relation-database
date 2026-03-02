// Report configuration types for configurable PDF generation

export interface PatientOverrides {
  owner?: string;
  patientName?: string;
  species?: string;
  gender?: string;
  dateOfBirth?: string;
  microchipId?: string;
}

export interface ReportConfig {
  patientOverrides: PatientOverrides;
  selectedAttachmentIds: number[]; // Which device files to include
  // Optional - for advanced mode (v2)
  selectedParameters?: {
    [deviceType: string]: string[];
  };
}

export interface GenerateConfiguredReportInput {
  medicalRecordId: number;
  config: ReportConfig;
}

// Device file info for display in the modal
export interface DeviceFileInfo {
  id: number;
  originalName: string;
  deviceType?: string;
  deviceName?: string;
  uploadedAt: string;
  mimeType?: string;
}

// Patient info from medical record context
export interface PatientInfo {
  name: string;
  owner: string;
  species: string;
  gender: string;
  dateOfBirth?: string;
  microchipId?: string;
}
