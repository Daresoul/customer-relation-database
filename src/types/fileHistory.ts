// File Access History Types - tracks device-generated files for crash protection

export interface FileAccessHistory {
  id: number;
  fileId: string;
  originalName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  deviceType: string;
  deviceName: string;
  connectionMethod?: string;
  receivedAt: string;
  firstAttachedToRecordId?: number;
  firstAttachedAt?: string;
  attachmentCount: number;
  lastAccessedAt: string;
}

export interface FileAccessHistoryWithRecord {
  id: number;
  fileId: string;
  originalName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  deviceType: string;
  deviceName: string;
  connectionMethod?: string;
  receivedAt: string;
  firstAttachedToRecordId?: number;
  firstAttachedAt?: string;
  attachmentCount: number;
  lastAccessedAt: string;
  /** 'failed' when the device sent bytes that couldn't be read as a result */
  status?: 'ok' | 'failed';
  error?: string | null;
  // Enriched fields
  patientName?: string;
  recordName?: string;
}
