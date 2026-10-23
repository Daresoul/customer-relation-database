/** 'H' above the range, 'L' below it, 'N' inside, 'U' unknown (no range or not a number). */
export type LabFlag = 'H' | 'L' | 'N' | 'U';

/** One stored analyte value (`lab_results`). */
export interface LabResultRow {
  id: number;
  patientId: number;
  medicalRecordId: number;
  recordName?: string | null;
  attachmentId: number;
  sourceFileId?: string | null;
  deviceType: string;
  deviceName?: string | null;
  /** Local wall time, YYYY-MM-DDTHH:mm:ss: the machine's clock, else when it arrived. */
  sampleAt: string;
  code: string;
  name: string;
  position: number;
  valueText: string;
  valueNum?: number | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  rangeText?: string | null;
  flag: LabFlag;
}

export interface PreviousLabValue {
  valueText: string;
  valueNum?: number | null;
  flag: LabFlag;
  sampleAt: string;
}

/** A record's lab value with the patient's previous value of the same analyte. */
export interface RecordLabValue extends LabResultRow {
  previous?: PreviousLabValue | null;
}
