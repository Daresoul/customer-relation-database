import { ApiService } from './api';
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

/**
 * Medical records service - uses ApiService with automatic case transformation
 * Frontend uses camelCase, backend uses snake_case - conversion is automatic
 */
export class MedicalService {
  static async getMedicalRecords(
    patientId: number,
    filter?: MedicalRecordFilter,
    pagination?: PaginationParams
  ): Promise<MedicalRecordsResponse> {
    return ApiService.invoke('get_medical_records', {
      patientId,
      filter,
      pagination
    });
  }

  static async getMedicalRecord(
    recordId: number,
    includeHistory = false
  ): Promise<MedicalRecordDetail> {
    return ApiService.invoke('get_medical_record', {
      recordId,
      includeHistory
    });
  }

  static async createMedicalRecord(
    input: CreateMedicalRecordInput
  ): Promise<MedicalRecord> {
    return ApiService.invoke('create_medical_record', { input });
  }

  static async updateMedicalRecord(
    recordId: number,
    updates: UpdateMedicalRecordInput
  ): Promise<MedicalRecord> {
    return ApiService.invoke('update_medical_record', {
      recordId,
      updates
    });
  }

  static async archiveMedicalRecord(
    recordId: number,
    archive: boolean
  ): Promise<void> {
    return ApiService.invoke('archive_medical_record', {
      recordId,
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

    return ApiService.invoke('upload_medical_attachment', {
      medicalRecordId,
      fileName: file.name,
      fileData: Array.from(fileData),
      mimeType: file.type,
      deviceType,
      deviceName,
      connectionMethod,
      attachmentType,
      sourceFileId
    });
  }

  static async downloadAttachment(
    attachmentId: number
  ): Promise<Blob> {
    const response = await ApiService.invoke<DownloadAttachmentResponse>(
      'download_medical_attachment',
      { attachmentId }
    );
    const uint8Array = new Uint8Array(response.fileData);
    return new Blob([uint8Array], { type: response.mimeType });
  }

  static async renderPdfAttachmentThumbnail(
    attachmentId: number,
    page = 1,
    width = 900,
  ): Promise<string> {
    return ApiService.invoke('render_medical_attachment_pdf_thumbnail', {
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
    return ApiService.invoke('render_medical_attachment_pdf_thumbnail_force', {
      attachmentId,
      page,
      width,
    });
  }

  static async getPdfAttachmentPageCount(
    attachmentId: number,
  ): Promise<number> {
    return ApiService.invoke('get_medical_attachment_pdf_page_count', {
      attachmentId
    });
  }

  static async deleteAttachment(
    attachmentId: number
  ): Promise<void> {
    return ApiService.invoke('delete_medical_attachment', { attachmentId });
  }

  static async searchMedicalRecords(
    patientId: number,
    searchTerm: string,
    includeArchived = false
  ): Promise<MedicalRecord[]> {
    const response = await ApiService.invoke<SearchMedicalRecordsResponse>(
      'search_medical_records',
      { patientId, searchTerm, includeArchived }
    );
    return response.records;
  }

  static async getCurrencies(): Promise<Currency[]> {
    return ApiService.invoke('get_currencies');
  }

  static async getMedicalRecordAtVersion(
    recordId: number,
    version: number
  ): Promise<MedicalRecord> {
    return ApiService.invoke('get_medical_record_at_version', {
      recordId,
      version
    });
  }

  static async revertMedicalRecord(recordId: number): Promise<MedicalRecord> {
    return ApiService.invoke('revert_medical_record', { recordId });
  }

  static async downloadAndOpenAttachment(
    attachmentId: number,
    fileName: string
  ): Promise<void> {
    const blob = await this.downloadAttachment(attachmentId);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  static async saveAttachmentAs(
    attachmentId: number,
    defaultFileName: string
  ): Promise<void> {
    const { save } = await import('@tauri-apps/api/dialog');

    const extension = defaultFileName.includes('.')
      ? defaultFileName.substring(defaultFileName.lastIndexOf('.'))
      : '';

    let targetPath = await save({
      defaultPath: defaultFileName,
      title: 'Save Attachment As',
      filters: extension ? [{
        name: `${extension.substring(1).toUpperCase()} Files`,
        extensions: [extension.substring(1)]
      }] : undefined
    });

    if (!targetPath) return;

    if (extension && !targetPath.toLowerCase().endsWith(extension.toLowerCase())) {
      targetPath = targetPath + extension;
    }

    await ApiService.invoke('write_medical_attachment_to_path', {
      attachmentId,
      targetPath
    });
  }

  static async openAttachmentExternally(attachmentId: number): Promise<void> {
    await ApiService.invoke('open_medical_attachment', { attachmentId });
  }

  static async printAttachment(attachmentId: number): Promise<void> {
    await ApiService.invoke('print_medical_attachment', { attachmentId });
  }

  static validateFile(file: File, maxSizeInMB = 100): string | null {
    const maxSize = maxSizeInMB * 1024 * 1024;
    if (file.size > maxSize) {
      return `File size exceeds ${maxSizeInMB}MB limit`;
    }
    return null;
  }

  static formatFileSize(bytes?: number): string {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = parseFloat((bytes / Math.pow(1024, i)).toFixed(2));
    return `${size} ${sizes[i]}`;
  }

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

  static async getDeviceFileById(fileId: string): Promise<DownloadAttachmentResponse> {
    return ApiService.invoke('download_device_file', { fileId });
  }
}
