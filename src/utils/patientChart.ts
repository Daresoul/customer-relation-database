import dayjs, { type Dayjs } from 'dayjs';

type T = (key: string, opts?: Record<string, unknown>) => string;
export type PatientStatus = 'active' | 'inactive' | 'deceased';
interface StatusFields {
  isActive: boolean;
  deceasedAt?: string | null;
}

/**
 * Days in the first week, weeks up to 8 weeks, months up to a year, then
 * years (and months). `today` is the date of death for a deceased patient.
 */
export function formatPatientAge(dob: string | null | undefined, t: T, today: Dayjs = dayjs()): string | null {
  if (!dob) return null;
  const birth = dayjs(dob);
  const now = today.startOf('day');
  if (!birth.isValid() || birth.isAfter(now)) return null;

  const days = now.diff(birth, 'day');
  if (days < 7) return t('patients:chart.age.days', { count: days });
  if (days < 56) return t('patients:chart.age.weeks', { count: Math.floor(days / 7) });

  const years = now.diff(birth, 'year');
  const months = now.diff(birth.add(years, 'year'), 'month');
  if (years === 0) return t('patients:chart.age.months', { count: months });
  const yearsText = t('patients:chart.age.years', { count: years });
  return months === 0 ? yearsText : `${yearsText} ${t('patients:chart.age.months', { count: months })}`;
}

export function patientStatus(p: StatusFields): PatientStatus {
  if (p.deceasedAt) return 'deceased';
  return p.isActive === false ? 'inactive' : 'active';
}

/** Default lists and pickers show active patients only. */
export function visiblePatients<P extends StatusFields>(list: P[], showInactive: boolean): P[] {
  return showInactive ? list : list.filter((p) => patientStatus(p) === 'active');
}

/** Active patients, plus the one an existing appointment already has (`keepId`). */
export function bookablePatients<P extends StatusFields & { id: number }>(list: P[], keepId?: number): P[] {
  return list.filter((p) => p.id === keepId || patientStatus(p) === 'active');
}

/** 12.4, not 12.40 */
export const formatKg = (weight: number): string => String(Number(weight.toFixed(2)));

export function alertColor(type: string): string {
  switch (type) {
    case 'allergy':
    case 'aggressive':
      return 'red';
    case 'chronic':
      return 'orange';
    default:
      return 'blue';
  }
}

/** "Female (spayed)", "Male (intact)", or the sex alone when neuter status is not recorded. */
export function sexLabel(gender: string | null | undefined, neutered: boolean | null | undefined, t: T): string | null {
  const sex = gender === 'Male' || gender === 'Female' ? gender : null;
  if (neutered === null || neutered === undefined) {
    return gender ? t(`entities:gender.${gender.toLowerCase()}`) : null;
  }
  if (sex === 'Female') return t(neutered ? 'patients:chart.sex.femaleSpayed' : 'patients:chart.sex.femaleIntact');
  if (sex === 'Male') return t(neutered ? 'patients:chart.sex.maleNeutered' : 'patients:chart.sex.maleIntact');
  return t(neutered ? 'patients:chart.sex.neutered' : 'patients:chart.sex.intact');
}
