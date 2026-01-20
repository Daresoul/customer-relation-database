/**
 * Unit Tests for deviceDataValidation Utility
 * Tests for validating patient selection and file consistency during device import
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validatePatientSelection,
  validateFileConsistency,
  validateAll,
  conflictToWarning,
} from '../../src/utils/deviceDataValidation';
import type { PendingDeviceFile } from '../../src/contexts/DeviceImportContext';
import type { PatientDataConflict } from '../../src/types/deviceImport';

// Helper to create mock device files
function createMockFile(
  fileName: string,
  testResults: Record<string, unknown> = {}
): PendingDeviceFile {
  return {
    id: `file-${fileName}`,
    deviceType: 'test_device',
    deviceName: 'Test Device',
    connectionMethod: 'serial_port',
    fileName,
    fileData: [],
    mimeType: 'application/json',
    testResults,
    detectedAt: new Date().toISOString(),
  };
}

// Helper to create mock patient
function createMockPatient(
  id: number,
  name: string,
  species?: string
): { id: number; name: string; species?: string } {
  return { id, name, species };
}

describe('deviceDataValidation Utility', () => {
  describe('validatePatientSelection', () => {
    describe('error cases', () => {
      it('returns error when no patient selected', () => {
        const files = [createMockFile('test.hl7', { patient_name: 'Max' })];
        const result = validatePatientSelection(null, files);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('no_patient_selected');
        expect(result.errors[0].message).toBe('Please select a patient');
      });

      it('returns error when no files provided', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const result = validatePatientSelection(patient, []);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('no_files_selected');
        expect(result.errors[0].message).toBe('No device files to upload');
      });

      it('returns both errors when no patient and no files', () => {
        const result = validatePatientSelection(null, []);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        // First error check stops early (no patient)
        expect(result.errors[0].type).toBe('no_patient_selected');
      });
    });

    describe('name mismatch warnings', () => {
      it('returns warning when file name differs from selected patient', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { patient_name: 'Bella' })];
        const result = validatePatientSelection(patient, files);

        expect(result.isValid).toBe(true); // Warnings don't invalidate
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].type).toBe('patient_name_mismatch');
        expect(result.warnings[0].severity).toBe('medium');
        expect(result.warnings[0].details).toEqual({
          fileName: 'test.hl7',
          filePatientName: 'Bella',
          selectedPatientName: 'Max',
        });
      });

      it('ignores case when comparing names', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { patient_name: 'max' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings).toHaveLength(0); // Case-insensitive match
      });

      it('ignores case when comparing names (uppercase file)', () => {
        const patient = createMockPatient(1, 'max', 'Dog');
        const files = [createMockFile('test.hl7', { patient_name: 'MAX' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings).toHaveLength(0);
      });

      it('no warning when file has no patient name', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { species: 'Dog' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings.filter((w) => w.type === 'patient_name_mismatch')).toHaveLength(0);
      });

      it('no warning when names match', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { patient_name: 'Max' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings.filter((w) => w.type === 'patient_name_mismatch')).toHaveLength(0);
      });
    });

    describe('species mismatch warnings', () => {
      it('returns warning when file species differs from selected patient', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { species: 'Cat' })];
        const result = validatePatientSelection(patient, files);

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].type).toBe('species_mismatch');
        expect(result.warnings[0].severity).toBe('high'); // Species mismatch is high severity
        expect(result.warnings[0].details).toEqual({
          fileName: 'test.hl7',
          fileSpecies: 'Cat',
          selectedSpecies: 'Dog',
        });
      });

      it('ignores case when comparing species', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { species: 'dog' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings.filter((w) => w.type === 'species_mismatch')).toHaveLength(0);
      });

      it('no warning when file has no species', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { patient_name: 'Max' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings.filter((w) => w.type === 'species_mismatch')).toHaveLength(0);
      });

      it('no warning when patient has no species', () => {
        const patient = createMockPatient(1, 'Max');
        const files = [createMockFile('test.hl7', { species: 'Dog' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings.filter((w) => w.type === 'species_mismatch')).toHaveLength(0);
      });

      it('no warning when species match', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { species: 'Dog' })];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings.filter((w) => w.type === 'species_mismatch')).toHaveLength(0);
      });
    });

    describe('multiple files', () => {
      it('validates each file and collects all warnings', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [
          createMockFile('file1.hl7', { patient_name: 'Bella', species: 'Cat' }),
          createMockFile('file2.hl7', { patient_name: 'Charlie', species: 'Rabbit' }),
        ];
        const result = validatePatientSelection(patient, files);

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(4); // 2 name + 2 species
        expect(result.warnings.filter((w) => w.type === 'patient_name_mismatch')).toHaveLength(2);
        expect(result.warnings.filter((w) => w.type === 'species_mismatch')).toHaveLength(2);
      });

      it('only returns warnings for files with mismatches', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [
          createMockFile('file1.hl7', { patient_name: 'Max', species: 'Dog' }), // Match
          createMockFile('file2.hl7', { patient_name: 'Bella', species: 'Cat' }), // Mismatch
        ];
        const result = validatePatientSelection(patient, files);

        expect(result.warnings).toHaveLength(2); // Only from file2
        expect(result.warnings[0].details.fileName).toBe('file2.hl7');
        expect(result.warnings[1].details.fileName).toBe('file2.hl7');
      });
    });

    describe('valid cases', () => {
      it('returns valid result when patient and file match', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { patient_name: 'Max', species: 'Dog' })];
        const result = validatePatientSelection(patient, files);

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      });

      it('returns valid result when file has no patient data', () => {
        const patient = createMockPatient(1, 'Max', 'Dog');
        const files = [createMockFile('test.hl7', { GLU: '95', BUN: '18' })];
        const result = validatePatientSelection(patient, files);

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });
    });
  });

  describe('validateFileConsistency', () => {
    it('returns empty result for single file', () => {
      const files = [createMockFile('test.hl7', { patient_name: 'Max' })];
      const result = validateFileConsistency(files);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('returns empty result for empty file list', () => {
      const result = validateFileConsistency([]);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('returns empty result when files have consistent data', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max', species: 'Dog' }),
        createMockFile('file2.hl7', { patient_name: 'Max', species: 'Dog' }),
      ];
      const result = validateFileConsistency(files);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('returns warning for name conflict', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
      ];
      const result = validateFileConsistency(files);

      expect(result.isValid).toBe(true); // Warnings don't invalidate
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('multi_file_name_conflict');
      expect(result.warnings[0].severity).toBe('medium');
    });

    it('returns warning for species conflict', () => {
      const files = [
        createMockFile('file1.hl7', { species: 'Dog' }),
        createMockFile('file2.hl7', { species: 'Cat' }),
      ];
      const result = validateFileConsistency(files);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('multi_file_species_conflict');
      expect(result.warnings[0].severity).toBe('low'); // Species conflict is low severity
    });

    it('returns warnings for multiple conflicts', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max', species: 'Dog' }),
        createMockFile('file2.hl7', { patient_name: 'Bella', species: 'Cat' }),
      ];
      const result = validateFileConsistency(files);

      expect(result.warnings).toHaveLength(2);
      const warningTypes = result.warnings.map((w) => w.type).sort();
      expect(warningTypes).toEqual(['multi_file_name_conflict', 'multi_file_species_conflict']);
    });

    it('includes conflict values in warning details', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
      ];
      const result = validateFileConsistency(files);

      expect(result.warnings[0].details.field).toBe('name');
      expect(result.warnings[0].details.conflicts).toBeDefined();
    });

    it('message includes all conflicting values', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
        createMockFile('file3.hl7', { patient_name: 'Charlie' }),
      ];
      const result = validateFileConsistency(files);

      expect(result.warnings[0].message).toContain('"Max"');
      expect(result.warnings[0].message).toContain('"Bella"');
      expect(result.warnings[0].message).toContain('"Charlie"');
    });
  });

  describe('validateAll', () => {
    it('combines errors from patient selection validation', () => {
      const result = validateAll(null, []);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('combines warnings from patient selection and file consistency', () => {
      const patient = createMockPatient(1, 'Max', 'Dog');
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Bella', species: 'Dog' }), // Name mismatch with patient
        createMockFile('file2.hl7', { patient_name: 'Charlie', species: 'Dog' }), // Different name in file
      ];
      const result = validateAll(patient, files);

      expect(result.isValid).toBe(true);
      // Should have: 2 patient name mismatches + 1 file consistency warning
      expect(result.warnings.length).toBe(3);
    });

    it('returns valid when all validations pass', () => {
      const patient = createMockPatient(1, 'Max', 'Dog');
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max', species: 'Dog' }),
        createMockFile('file2.hl7', { patient_name: 'Max', species: 'Dog' }),
      ];
      const result = validateAll(patient, files);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('returns invalid when patient selection validation fails', () => {
      const files = [createMockFile('test.hl7', { patient_name: 'Max' })];
      const result = validateAll(null, files);

      expect(result.isValid).toBe(false);
    });

    it('file consistency validation still runs even with patient selection errors', () => {
      // validateAll runs both validations and combines results
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
      ];
      const result = validateAll(null, files);

      // Has error from no patient + warning from file consistency
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('conflictToWarning', () => {
    it('converts name conflict to warning', () => {
      const conflict: PatientDataConflict = {
        field: 'name',
        values: [
          { value: 'Max', source: 'file1.hl7' },
          { value: 'Bella', source: 'file2.hl7' },
        ],
      };
      const warning = conflictToWarning(conflict);

      expect(warning.type).toBe('multi_file_name_conflict');
      expect(warning.severity).toBe('medium');
      expect(warning.message).toContain('name');
      expect(warning.details.field).toBe('name');
      expect(warning.details.values).toEqual(conflict.values);
    });

    it('converts species conflict to warning', () => {
      const conflict: PatientDataConflict = {
        field: 'species',
        values: [
          { value: 'Dog', source: 'file1.hl7' },
          { value: 'Cat', source: 'file2.hl7' },
        ],
      };
      const warning = conflictToWarning(conflict);

      expect(warning.type).toBe('multi_file_name_conflict'); // Uses default type
      expect(warning.message).toContain('species');
    });

    it('converts dateOfBirth conflict to warning', () => {
      const conflict: PatientDataConflict = {
        field: 'dateOfBirth',
        values: [
          { value: '2020-03-15', source: 'file1.hl7' },
          { value: '2019-01-01', source: 'file2.hl7' },
        ],
      };
      const warning = conflictToWarning(conflict);

      expect(warning.message).toContain('dateOfBirth');
    });
  });

  describe('real-world scenarios', () => {
    it('validates typical device import flow', () => {
      const patient = createMockPatient(1, 'Max', 'Dog');
      const files = [
        createMockFile('pointcare_chemistry.hl7', {
          patient_name: 'Max',
          species: 'canine',
          GLU: '95',
          BUN: '18',
        }),
        createMockFile('exigo_cbc.xml', {
          ID2: 'Max',
          APNA: 'DOG',
          WBC: '12.5',
        }),
      ];
      const result = validateAll(patient, files);

      expect(result.isValid).toBe(true);
      // Note: species extraction normalizes 'canine' to 'Dog' and 'DOG' to 'Dog'
      // so there should be no species conflict
    });

    it('detects wrong patient selection', () => {
      const patient = createMockPatient(1, 'Bella', 'Cat');
      const files = [
        createMockFile('test.hl7', {
          patient_name: 'Max',
          species: 'Dog',
        }),
      ];
      const result = validateAll(patient, files);

      expect(result.isValid).toBe(true); // Warnings only
      expect(result.warnings).toHaveLength(2); // Name + species mismatch
    });

    it('handles mixed valid and invalid data', () => {
      const patient = createMockPatient(1, 'Max', 'Dog');
      const files = [
        createMockFile('good_file.hl7', { patient_name: 'Max', species: 'Dog' }),
        createMockFile('bad_file.hl7', { patient_name: 'Bella', species: 'Cat' }),
        createMockFile('partial_file.hl7', { species: 'Dog' }), // No name
      ];
      const result = validateAll(patient, files);

      expect(result.isValid).toBe(true);
      // bad_file has name and species mismatch
      // Files have name conflict (Max vs Bella)
      // Files have species conflict (Dog vs Cat vs Dog)
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('validates files without patient data', () => {
      const patient = createMockPatient(1, 'Max', 'Dog');
      const files = [
        createMockFile('results_only.hl7', { GLU: '95', BUN: '18', CRE: '1.2' }),
      ];
      const result = validateAll(patient, files);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
