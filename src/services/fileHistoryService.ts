import { invoke } from '@tauri-apps/api';
import type { FileAccessHistoryWithRecord, RecordDeviceFileAccessInput } from '../types/fileHistory';

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
};
