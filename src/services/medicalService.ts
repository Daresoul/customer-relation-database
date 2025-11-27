import { invoke } from '@tauri-apps/api/tauri';
import type {
  MedicalRecord,
  MedicalRecordDetail,
  MedicalRecordsResponse,
  CreateMedicalRecordInput,
  UpdateMedicalRecordInput,
  MedicalRecordFilter,
  PaginationParams,
  MedicalAttachment,
  DownloadAttachmentResponse,
  SearchMedicalRecordsResponse,
  Currency
} from '@/types/medical';

export class MedicalService {
  static async getMedicalRecords(
    patientId: number,
    filter?: MedicalRecordFilter,
    pagination?: PaginationParams
  ): Promise<MedicalRecordsResponse> {
    return invoke('get_medical_records', {
      patientId: patientId,
      filter,
      pagination
    });
  }

  static async getMedicalRecord(
    recordId: number,
    includeHistory = false
  ): Promise<MedicalRecordDetail> {
    try {
      const result = await invoke<MedicalRecordDetail>('get_medical_record', {
        // Send both snake_case and camelCase to be compatible with backend variants
        record_id: recordId,
        recordId: recordId as any,
        include_history: includeHistory,
        includeHistory: includeHistory as any,
      });
      return result;
    } catch (e) {
      console.error('[MedicalService] getMedicalRecord <- error:', e);
      throw e;
    }
  }

  static async createMedicalRecord(
    input: CreateMedicalRecordInput
  ): Promise<MedicalRecord> {
    const result = await invoke<MedicalRecord>('create_medical_record', { input });
    return result;
  }

  static async updateMedicalRecord(
    recordId: number,
    updates: UpdateMedicalRecordInput
  ): Promise<MedicalRecord> {
    return invoke('update_medical_record', {
      // Support both arg conventions
      record_id: recordId,
      recordId: recordId as any,
      updates
    });
  }

  static async archiveMedicalRecord(
    recordId: number,
    archive: boolean
  ): Promise<void> {
    return invoke('archive_medical_record', {
      record_id: recordId,
      recordId: recordId as any,
      archive
    });
  }

  static async uploadAttachment(
    medicalRecordId: number,
    file: File,
    deviceType?: string,
    deviceName?: string,
    connectionMethod?: string,
    attachmentType?: 'file' | 'test_result' | 'generated_pdf',
    sourceFileId?: string
  ): Promise<MedicalAttachment> {
    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    return invoke('upload_medical_attachment', {
      medicalRecordId: medicalRecordId,
      fileName: file.name,
      fileData: Array.from(fileData),
      mimeType: file.type,
      deviceType: deviceType,
      deviceName: deviceName,
      connectionMethod: connectionMethod,
      attachmentType: attachmentType,
      sourceFileId: sourceFileId
    });
  }

  static async downloadAttachment(
    attachmentId: number
  ): Promise<Blob> {
    const response = await invoke<DownloadAttachmentResponse>('download_medical_attachment', { attachment_id: attachmentId, attachmentId: attachmentId as any });
    const uint8Array = new Uint8Array(response.fileData);
    const blob = new Blob([uint8Array], { type: response.mimeType });
    return blob;
  }

  // Render a PDF attachment first page to PNG (desktop app only) and return temp file path
  static async renderPdfAttachmentThumbnail(
    attachmentId: number,
    page = 1,
    width = 900,
  ): Promise<string> {
    return invoke<string>('render_medical_attachment_pdf_thumbnail', {
      attachmentId,
      page,
      width,
    });
  }

  static async renderPdfAttachmentThumbnailForce(
    attachmentId: number,
    page = 1,
    width = 900,
  ): Promise<string> {
    return invoke<string>('render_medical_attachment_pdf_thumbnail_force', {
      attachmentId,
      page,
      width,
    });
  }

  static async getPdfAttachmentPageCount(
    attachmentId: number,
  ): Promise<number> {
    return invoke<number>('get_medical_attachment_pdf_page_count', {
      attachment_id: attachmentId,
      attachmentId: attachmentId as any,
    });
  }

  static async deleteAttachment(
    attachmentId: number
  ): Promise<void> {
    return invoke('delete_medical_attachment', { attachment_id: attachmentId, attachmentId: attachmentId as any });
  }

  static async searchMedicalRecords(
    patientId: number,
    searchTerm: string,
    includeArchived = false
  ): Promise<MedicalRecord[]> {
    const response = await invoke<SearchMedicalRecordsResponse>(
      'search_medical_records',
      {
        patient_id: patientId,
        patientId: patientId as any,
        search_term: searchTerm,
        searchTerm: searchTerm as any,
        include_archived: includeArchived,
        includeArchived: includeArchived as any
      }
    );
    return response.records;
  }

  static async getCurrencies(): Promise<Currency[]> {
    const currencies = await invoke<Currency[]>('get_currencies');
    return currencies;
  }

  static async getMedicalRecordAtVersion(recordId: number, version: number): Promise<MedicalRecord> {
    try {
      const res = await invoke<MedicalRecord>('get_medical_record_at_version', { record_id: recordId, recordId: recordId as any, version });
      return res;
    } catch (e) {
      console.error('[MedicalService] getMedicalRecordAtVersion <- error', e);
      throw e;
    }
  }

  static async revertMedicalRecord(recordId: number): Promise<MedicalRecord> {
    return invoke('revert_medical_record', { record_id: recordId, recordId: recordId as any });
  }

  /**
   * Helper method to download and open an attachment
   */
  static async downloadAndOpenAttachment(
    attachmentId: number,
    fileName: string
  ): Promise<void> {
    try {
      const blob = await this.downloadAttachment(attachmentId);
      const url = URL.createObjectURL(blob);

      // Create a temporary link to download the file
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('Failed to download attachment:', error);
      throw error;
    }
  }

  // Desktop-friendly: choose a save location and write the attachment
  static async saveAttachmentAs(attachmentId: number, defaultFileName: string): Promise<void> {
    try {
      const { save } = await import('@tauri-apps/api/dialog');
      const targetPath = await save({
        defaultPath: defaultFileName,
        title: 'Save Attachment As'
      });
      if (!targetPath) return; // user cancelled
      await invoke('write_medical_attachment_to_path', {
        attachment_id: attachmentId,
        attachmentId: attachmentId as any,
        target_path: targetPath
      });
    } catch (e: any) {
      console.error('Save As failed:', e);
      throw e;
    }
  }

  // Desktop-friendly: materialize the file to temp and open with default app
  static async openAttachmentExternally(attachmentId: number): Promise<void> {
    await invoke('open_medical_attachment', { attachment_id: attachmentId, attachmentId: attachmentId as any });
  }

  // Desktop-friendly: print the PDF using the system's native print functionality
  static async printAttachment(attachmentId: number): Promise<void> {
    await invoke('print_medical_attachment', { attachment_id: attachmentId, attachmentId: attachmentId as any });
  }

  /**
   * Helper method to validate file before upload
   */
  static validateFile(file: File, maxSizeInMB = 100): string | null {
    const maxSize = maxSizeInMB * 1024 * 1024; // Convert to bytes

    if (file.size > maxSize) {
      return `File size exceeds ${maxSizeInMB}MB limit`;
    }

    // Allow all file types - doctors can upload any medical records, device data, etc.
    // Only restriction is file size for practical storage reasons

    return null; // No validation errors
  }

  /**
   * Helper to format file size for display
   */
  static formatFileSize(bytes?: number): string {
    if (!bytes) return 'Unknown size';

    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = parseFloat((bytes / Math.pow(1024, i)).toFixed(2));

    return `${size} ${sizes[i]}`;
  }

  /**
   * Helper to get file icon based on MIME type
   */
  static getFileIcon(mimeType?: string): string {
    if (!mimeType) return '📄';

    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📑';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('xml')) return '📋';
    if (mimeType === 'application/json') return '{ }';
    if (mimeType.startsWith('text/')) return '📃';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';

    return '📄';
  }

  /**
   * Download device file by file_id from file history
   */
  static async getDeviceFileById(fileId: string): Promise<DownloadAttachmentResponse> {
    const response = await invoke<DownloadAttachmentResponse>('download_device_file', {
      file_id: fileId,
      fileId: fileId as any,
    });
    return response;
  }
}
