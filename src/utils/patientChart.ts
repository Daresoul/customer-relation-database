import type { Dayjs } from 'dayjs';

type T = (key: string, opts?: Record<string, unknown>) => string;
export type PatientStatus = 'active' | 'inactive' | 'deceased';
interface StatusFields {
  isActive: boolean;
  deceasedAt?: string | null;
}

export function formatPatientAge(_dob: string | null | undefined, _t: T, _today?: Dayjs): string | null {
  return undefined as unknown as null;
}

export function patientStatus(_p: StatusFields): PatientStatus {
  return undefined as unknown as PatientStatus;
}

export function visiblePatients<P extends StatusFields>(list: P[], _showInactive: boolean): P[] {
  return list.slice(0, 0);
}

export function alertColor(_type: string): string {
  return '';
}

export function sexLabel(_gender: string | null | undefined, _neutered: boolean | null | undefined, _t: T): string | null {
  return '';
}
