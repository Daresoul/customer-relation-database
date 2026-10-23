import { invoke } from './invoke';
import type {
  DiscardReason,
  LabInboxItem,
  LabInboxState,
  LabMoveOutcome,
  StoredDeviceData,
} from '../types/labInbox';
import type { MedicalAttachment } from '../types/medical';

// Raw invoke throughout: a case transform would rename the device's
// `<CODE>_range` / `<CODE>_flag` result keys.
export const labInboxService = {
  list(state?: LabInboxState): Promise<LabInboxItem[]> {
    return invoke<LabInboxItem[]>('list_lab_inbox', { state: state ?? null });
  },

  countWaiting(): Promise<number> {
    return invoke<number>('get_lab_inbox_count');
  },

  discard(fileId: string, reason: DiscardReason, note?: string): Promise<void> {
    return invoke<void>('discard_lab_result', { fileId, reason, note: note || null });
  },

  restore(fileId: string): Promise<void> {
    return invoke<void>('restore_lab_result', { fileId });
  },

  /** Attach a received result to an existing record; returns the attachment id. */
  attach(fileId: string, medicalRecordId: number): Promise<number> {
    return invoke<number>('attach_lab_result', { fileId, medicalRecordId });
  },

  move(attachmentId: number, targetRecordId: number): Promise<LabMoveOutcome> {
    return invoke<LabMoveOutcome>('move_lab_result', { attachmentId, targetRecordId });
  },

  /** The stored result parsed again, ready for the import flow. */
  getDeviceData(fileId: string): Promise<StoredDeviceData> {
    return invoke<StoredDeviceData>('get_device_data_from_history', { fileId });
  },

  /** Rebuild the record's lab report from all its lab results. */
  regenerateLabReport(medicalRecordId: number): Promise<MedicalAttachment> {
    return invoke<MedicalAttachment>('regenerate_pdf_from_medical_record', { medicalRecordId });
  },
};
