import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { formatPatientAge, patientStatus, visiblePatients, alertColor, sexLabel, bookablePatients } from '../patientChart';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && 'count' in opts ? `${key}:${opts.count}` : key;
const today = dayjs('2026-10-23');

describe('formatPatientAge', () => {
  it('is empty without a date of birth, or with one in the future', () => {
    expect(formatPatientAge(undefined, t, today)).toBeNull();
    expect(formatPatientAge('2026-11-01', t, today)).toBeNull();
  });

  it('counts days in the first week', () => {
    expect(formatPatientAge('2026-10-20', t, today)).toBe('patients:chart.age.days:3');
  });

  it('counts weeks for a puppy under 8 weeks', () => {
    expect(formatPatientAge('2026-09-18', t, today)).toBe('patients:chart.age.weeks:5');
  });

  it('counts months under a year', () => {
    expect(formatPatientAge('2026-05-10', t, today)).toBe('patients:chart.age.months:5');
  });

  it('gives years and months from a year on, and leaves out zero months', () => {
    expect(formatPatientAge('2023-07-01', t, today)).toBe('patients:chart.age.years:3 patients:chart.age.months:3');
    expect(formatPatientAge('2024-10-01', t, today)).toBe('patients:chart.age.years:2');
  });
});

describe('patientStatus', () => {
  it('is deceased with a date of death, inactive when hidden, active otherwise', () => {
    expect(patientStatus({ isActive: false, deceasedAt: '2026-01-05' })).toBe('deceased');
    expect(patientStatus({ isActive: false, deceasedAt: null })).toBe('inactive');
    expect(patientStatus({ isActive: true })).toBe('active');
  });
});

describe('visiblePatients', () => {
  const list = [
    { id: 1, isActive: true },
    { id: 2, isActive: false, deceasedAt: '2026-01-05' },
    { id: 3, isActive: false },
  ];

  it('hides inactive and deceased patients unless asked', () => {
    expect(visiblePatients(list, false).map((p) => p.id)).toEqual([1]);
    expect(visiblePatients(list, true).map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

describe('alertColor', () => {
  it('is red for allergy and aggressive', () => {
    expect(alertColor('allergy')).toBe('red');
    expect(alertColor('aggressive')).toBe('red');
    expect(alertColor('chronic')).toBe('orange');
    expect(alertColor('other')).toBe('blue');
  });
});

describe('sexLabel', () => {
  it('names the neuter status with the sex', () => {
    expect(sexLabel('Female', true, t)).toBe('patients:chart.sex.femaleSpayed');
    expect(sexLabel('Male', true, t)).toBe('patients:chart.sex.maleNeutered');
    expect(sexLabel('Male', false, t)).toBe('patients:chart.sex.maleIntact');
    expect(sexLabel('Female', null, t)).toBe('entities:gender.female');
    expect(sexLabel(null, null, t)).toBeNull();
  });
});

describe('bookablePatients', () => {
  const list = [
    { id: 1, isActive: true },
    { id: 2, isActive: false, deceasedAt: '2026-01-05' },
    { id: 3, isActive: false },
  ];

  it('offers active patients only, plus the one an existing appointment already has', () => {
    expect(bookablePatients(list).map((p) => p.id)).toEqual([1]);
    expect(bookablePatients(list, 3).map((p) => p.id)).toEqual([1, 3]);
  });
});
