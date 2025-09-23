// Medical History Types

export interface MedicalRecord {
  id: number;
  patientId: number;
  recordType: 'procedure' | 'note';
  name: string; // This will hold procedureName for procedures, title for notes
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

export interface MedicalAttachment {
  id: number;
  medicalRecordId: number;
  fileId: string;
  originalName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt: string;
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

export interface CreateMedicalRecordInput {
  patientId: number;
  recordType: 'procedure' | 'note';
  name: string; // This will hold procedureName for procedures, title for notes
  procedureName?: string; // Deprecated - backend ignores this
  description: string;
  price?: number;
  currencyId?: number;
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
  recordType?: 'procedure' | 'note';
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