import { invoke } from '@tauri-apps/api';
import type {
  FileAccessHistoryWithRecord,
  RecordDeviceFileAccessInput,
  PendingFileMeta,
  PendingDeviceEntryWithFile,
} from '../types/fileHistory';

export const fileHistoryService = {
  /**
   * Get recent device files from the last N days (default 14)
   */
  async getRecentDeviceFiles(days?: number): Promise<FileAccessHistoryWithRecord[]> {
    return await invoke('get_recent_device_files', { days });
  },

  /**
   * Get file history for a specific file ID
   */
  async getFileHistory(fileId: string): Promise<FileAccessHistoryWithRecord | null> {
    return await invoke('get_file_history', { fileId });
  },

  /**
   * Record device file access when data is received
   */
  async recordDeviceFileAccess(input: RecordDeviceFileAccessInput): Promise<void> {
    return await invoke('record_device_file_access', input);
  },

  /**
   * Update file attachment when added to a medical record
   */
  async updateFileAttachment(fileId: string, medicalRecordId: number): Promise<void> {
    return await invoke('update_file_attachment', { fileId, medicalRecordId });
  },

  /**
   * Cleanup old file history entries (older than N days)
   */
  async cleanupOldFileHistory(days?: number): Promise<number> {
    return await invoke('cleanup_old_file_history', { days });
  },

  /**
   * Save incoming device files for later processing by associating a user-entered patient serial
   */
  async saveDeviceFilesForLater(patientSerial: string, files: PendingFileMeta[], patientIdentifier?: string): Promise<number> {
    return await invoke('save_device_files_for_later', {
      patientSerial,
      patientIdentifier: patientIdentifier || null,
      files,
    });
  },

  /**
   * List pending device entries (optionally filter by serial)
   */
  async listPendingDeviceEntries(query?: string, status: 'pending' | 'processed' | 'cancelled' = 'pending', limit = 100, offset = 0): Promise<PendingDeviceEntryWithFile[]> {
    return await invoke('list_pending_device_entries', { query: query || null, status, limit, offset });
  },

  /** Mark a pending device entry processed */
  async markPendingEntryProcessed(id: number): Promise<void> {
    return await invoke('mark_pending_entry_processed', { id });
  },
};
