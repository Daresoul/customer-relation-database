export type LabInboxState = 'waiting' | 'attached' | 'discarded';
export type DiscardReason = 'qc' | 'test' | 'duplicate' | 'other';

export interface LabValue {
  code: string;
  value: string;
  unit?: string | null;
  range?: string | null;
  /** 'H' above the machine's range, 'L' below it */
  flag?: 'H' | 'L' | null;
}

export interface LabInboxItem {
  fileId: string;
  originalName: string;
  deviceType: string;
  deviceName: string;
  receivedAt: string;
  /** 'failed' when the machine sent bytes that couldn't be read */
  status: 'ok' | 'failed';
  error?: string | null;
  state: LabInboxState;
  /** DiscardReason, or 'before_inbox' for results that arrived before the inbox existed */
  discardReason?: string | null;
  discardNote?: string | null;
  discardedAt?: string | null;
  attachedRecordId?: number | null;
  attachedRecordName?: string | null;
  attachedPatientId?: number | null;
  attachedPatientName?: string | null;
  attachedAt?: string | null;
  /** The live lab attachment made from this result */
  attachmentId?: number | null;
  machinePatientId?: string | null;
  matchMethod: 'microchip' | 'name' | 'none';
  matchAmbiguous: boolean;
  matchCandidates: number;
  matchedPatientId?: number | null;
  matchedPatientName?: string | null;
  values: LabValue[];
  /** The time the machine put on the result (its own clock). */
  machineTime?: string | null;
  /** That time is more than 10 minutes after arrival: the machine's clock is ahead. */
  clockAhead?: boolean;
}

export interface LabMoveOutcome {
  attachmentId: number;
  fromRecordId: number;
  toRecordId: number;
  pdfs: Array<{ kind: string; ok: boolean; error?: string | null }>;
}

/** A stored result parsed again, as `device-data-received` sends it. */
export interface StoredDeviceData {
  deviceType: string;
  deviceName: string;
  connectionMethod: string;
  patientIdentifier?: string | null;
  testResults: Record<string, unknown>;
  originalFileName: string;
  fileData: number[];
  mimeType: string;
  detectedAt: string;
}
