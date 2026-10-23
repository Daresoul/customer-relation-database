import { invoke } from './invoke';
import type { LabResultRow, RecordLabValue } from '../types/labResults';

export const labResultsService = {
  /** Every lab value of the patient, newest sample first. */
  forPatient(patientId: number): Promise<LabResultRow[]> {
    return invoke<LabResultRow[]>('get_patient_lab_results', { patientId });
  },

  /** The record's lab values, each with the patient's previous value of it. */
  forRecord(medicalRecordId: number): Promise<RecordLabValue[]> {
    return invoke<RecordLabValue[]>('get_record_lab_values', { medicalRecordId });
  },
};
