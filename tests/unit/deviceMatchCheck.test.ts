import { describe, it, expect } from 'vitest';
import { validatePatientSelection, getMatchStrength } from '../../src/utils/deviceDataValidation';
import type { PendingDeviceFile } from '../../src/contexts/DeviceImportContext';

function file(overrides: Partial<PendingDeviceFile> = {}): PendingDeviceFile {
  return {
    id: 'f1',
    deviceType: 'exigo_eos_vet',
    deviceName: 'Exigo',
    connectionMethod: 'file_watch',
    fileName: 'exigo.xml',
    fileData: [],
    mimeType: 'application/xml',
    testResults: {},
    detectedAt: '2026-10-23T10:00:00Z',
    ...overrides,
  };
}

const CHIP = '807010000007678';

describe('validatePatientSelection — machine ID', () => {
  it('warns when the machine sent a chip the picked patient does not have', () => {
    const result = validatePatientSelection(
      { id: 1, name: 'Max', species: 'Dog', microchipId: '978000000000001' },
      [file({ patientIdentifier: CHIP })],
    );

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('patient_id_mismatch');
    expect(result.warnings[0].details).toEqual({
      fileName: 'exigo.xml',
      fileIdentifier: CHIP,
      selectedMicrochipId: '978000000000001',
    });
  });

  it('warns when the machine sent a chip and the picked patient has none', () => {
    const result = validatePatientSelection({ id: 1, name: 'Max' }, [file({ patientIdentifier: CHIP })]);

    expect(result.warnings.map((w) => w.type)).toEqual(['patient_id_mismatch']);
  });

  it('does not treat a name identifier as a chip', () => {
    const result = validatePatientSelection(
      { id: 1, name: 'Max', microchipId: CHIP },
      [file({ patientIdentifier: 'MAX K' })],
    );

    expect(result.warnings).toHaveLength(0);
  });

  it('a chip that matches the picked patient silences the name check', () => {
    const result = validatePatientSelection(
      { id: 1, name: 'Тесла', microchipId: CHIP },
      [file({ patientIdentifier: CHIP, testResults: { patient_name: 'tesi' } })],
    );

    expect(result.warnings).toHaveLength(0);
  });

  it('copes with a patient without a name', () => {
    const result = validatePatientSelection(
      { id: 1 },
      [file({ testResults: { patient_name: 'Max' } })],
    );

    expect(result.warnings.map((w) => w.type)).toEqual(['patient_name_mismatch']);
  });
});

describe('getMatchStrength', () => {
  it('is a chip match when the backend matched the picked patient by chip', () => {
    const files = [file({ patientIdentifier: CHIP, patientId: 1, matchMethod: 'microchip' })];
    expect(getMatchStrength(files, { id: 1, name: 'Max' })).toBe('chip');
  });

  it('is a chip match when the picked patient carries the machine chip', () => {
    const files = [file({ patientIdentifier: CHIP })];
    expect(getMatchStrength(files, { id: 7, name: 'Max', microchipId: CHIP })).toBe('chip');
  });

  it('is a name guess when the backend matched the picked patient by name', () => {
    const files = [file({ patientIdentifier: 'MAX', patientId: 1, matchMethod: 'name' })];
    expect(getMatchStrength(files, { id: 1, name: 'Max' })).toBe('name');
  });

  it('is manual when the user picked another patient', () => {
    const files = [file({ patientIdentifier: 'MAX', patientId: 1, matchMethod: 'name' })];
    expect(getMatchStrength(files, { id: 2, name: 'Bella' })).toBe('manual');
  });

  it('reports a chip shared by several patients, even after a pick', () => {
    const files = [file({ patientIdentifier: CHIP, matchMethod: 'microchip', matchAmbiguous: true })];
    expect(getMatchStrength(files, null)).toBe('chip_ambiguous');
    expect(getMatchStrength(files, { id: 2, name: 'Max', microchipId: CHIP })).toBe('chip_ambiguous');
  });

  it('reports a name shared by several patients until one is picked', () => {
    const files = [file({ patientIdentifier: 'MAX', matchMethod: 'name', matchAmbiguous: true })];
    expect(getMatchStrength(files, null)).toBe('name_ambiguous');
    expect(getMatchStrength(files, { id: 2, name: 'Max' })).toBe('manual');
  });

  it('is none when nothing matched and nobody is picked', () => {
    expect(getMatchStrength([file({ patientIdentifier: 'MAX', matchMethod: 'none' })], null)).toBe('none');
    expect(getMatchStrength([file()], null)).toBe('none');
  });
});
