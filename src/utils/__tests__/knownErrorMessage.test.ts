import { describe, it, expect } from 'vitest';
import { knownErrorMessage } from '../errors';

const t = (key: string) =>
  key === 'errors:patient.microchipAlreadyRegistered' ? 'Овој микрочип е веќе регистриран на друг пациент.' : key;

describe('knownErrorMessage', () => {
  it('translates the backend duplicate-chip error', () => {
    const error = new Error('Microchip 807010000007678 is already registered to another patient: Бобо');

    expect(knownErrorMessage(error, t)).toBe('Овој микрочип е веќе регистриран на друг пациент.');
  });

  it('accepts a plain string error', () => {
    expect(knownErrorMessage('Microchip 1 is already registered to another patient: #3', t)).toBe(
      'Овој микрочип е веќе регистриран на друг пациент.',
    );
  });

  it('returns null for errors it has no message for', () => {
    expect(knownErrorMessage(new Error('Failed to create patient: disk I/O error'), t)).toBeNull();
  });
});
