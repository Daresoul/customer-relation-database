import { invoke } from '@tauri-apps/api';
import type {
  FileAccessHistoryWithRecord,
  RecordDeviceFileAccessInput,
} from '../types/fileHistory';

/** Raw device file pulled back from history (bytes + device metadata). */
export interface DeviceFileDownload {
  fileName: string;
  fileData: number[];
  mimeType: string;
  deviceType: string;
  deviceName: string;
  connectionMethod?: string | null;
  testResults?: unknown;
}

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
   * Fetch a previously-received device file's bytes + metadata from history,
   * so it can be re-added to the current import flow.
   */
  async downloadDeviceFile(fileId: string): Promise<DeviceFileDownload> {
    return await invoke('download_device_file', { fileId });
  },

  /**
   * Open a device file's raw content in the OS default app (for debugging /
   * inspecting exactly what a device sent). The backend copies it to a temp file
   * with the original extension so it opens in the right viewer.
   */
  async openDeviceFile(fileId: string): Promise<void> {
    return await invoke('open_device_file', { fileId });
  },
};
