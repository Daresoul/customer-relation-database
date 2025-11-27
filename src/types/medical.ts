// Medical History Types

// Record types: 'procedure' (billable), 'note' (general notes), 'test_result' (device test data)
export type RecordType = 'procedure' | 'note' | 'test_result';

export interface MedicalRecord {
  id: number;
  patientId: number;
  recordType: RecordType;
  name: string; // This will hold procedureName for procedures, title for notes/test_results
  procedureName?: string; // Deprecated - kept for backward compatibility
  description: string;
  price?: number;
  currencyId?: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  version: number;
  attachments?: MedicalAttachment[];
  currency?: Currency;
}

// Attachment types: 'file' (manual uploads), 'test_result' (device data like Exigo XML), 'generated_pdf'
export type AttachmentType = 'file' | 'test_result' | 'generated_pdf';

export interface MedicalAttachment {
  id: number;
  medicalRecordId: number;
  fileId: string;
  originalName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt: string;
  deviceType?: string;
  deviceName?: string;
  connectionMethod?: string;
  attachmentType?: AttachmentType;
}

export interface MedicalRecordHistory {
  id: number;
  medicalRecordId: number;
  version: number;
  changedFields?: string[];
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changedBy?: string;
  changedAt: string;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol?: string;
}

export interface DeviceDataInput {
  deviceTestData: any;
  deviceType: string;
  deviceName: string;
}

export interface CreateMedicalRecordInput {
  patientId: number;
  recordType: RecordType;
  name: string; // This will hold procedureName for procedures, title for notes/test_results
  procedureName?: string; // Deprecated - backend ignores this
  description: string;
  price?: number;
  currencyId?: number;
  // Optional device test data for PDF generation (legacy single device)
  deviceTestData?: any;
  deviceType?: string;
  deviceName?: string;
  // New: support for multiple devices
  deviceDataList?: DeviceDataInput[];
}

export interface UpdateMedicalRecordInput {
  name?: string;
  procedureName?: string;
  description?: string;
  price?: number;
  currencyId?: number;
  isArchived?: boolean;
}

export interface MedicalRecordFilter {
  recordType?: RecordType;
  isArchived?: boolean;
  searchTerm?: string;
}

export interface MedicalRecordsResponse {
  records: MedicalRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MedicalRecordDetail {
  record: MedicalRecord;
  attachments: MedicalAttachment[];
  history?: MedicalRecordHistory[];
}

export interface UploadAttachmentRequest {
  medicalRecordId: number;
  fileName: string;
  fileData: number[]; // Array of bytes for Tauri
  mimeType: string;
}

export interface DownloadAttachmentResponse {
  fileName: string;
  fileData: number[]; // Array of bytes from Tauri
  mimeType: string;
}

export interface SearchMedicalRecordsResponse {
  records: MedicalRecord[];
  matchCount: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// Record Template Types
export interface RecordTemplate {
  id: number;
  recordType: RecordType;
  title: string;
  description: string;
  price?: number;
  currencyId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecordTemplateInput {
  recordType: RecordType;
  title: string;
  description: string;
  price?: number;
  currencyId?: number;
}

export interface UpdateRecordTemplateInput {
  title?: string;
  description?: string;
  price?: number;
  currencyId?: number;
}