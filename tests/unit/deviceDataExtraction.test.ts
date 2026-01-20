/**
 * Unit Tests for deviceDataExtraction Utility
 * Tests for extracting patient data from various device file formats
 */

import { describe, it, expect } from 'vitest';
import {
  extractPatientDataFromFile,
  aggregatePatientData,
  detectPatientDataConflicts,
  hasExtractedData,
} from '../../src/utils/deviceDataExtraction';
import type { PendingDeviceFile } from '../../src/contexts/DeviceImportContext';

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

describe('deviceDataExtraction Utility', () => {
  describe('extractPatientDataFromFile', () => {
    describe('name extraction', () => {
      it('extracts name from patient_name field (HL7 format)', () => {
        const file = createMockFile('test.hl7', { patient_name: 'Max' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBe('Max');
      });

      it('extracts name from patientName field (camelCase)', () => {
        const file = createMockFile('test.json', { patientName: 'Bella' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBe('Bella');
      });

      it('extracts name from name field (simple)', () => {
        const file = createMockFile('test.json', { name: 'Charlie' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBe('Charlie');
      });

      it('extracts name from ID2 field (Exigo format)', () => {
        const file = createMockFile('exigo.xml', { ID2: 'Luna' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBe('Luna');
      });

      it('prioritizes patient_name over other fields', () => {
        const file = createMockFile('test.hl7', {
          patient_name: 'HL7Name',
          patientName: 'CamelName',
          name: 'SimpleName',
          ID2: 'ExigoName',
        });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBe('HL7Name');
      });

      it('trims whitespace from name', () => {
        const file = createMockFile('test.hl7', { patient_name: '  Max  ' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBe('Max');
      });

      it('returns undefined for empty name', () => {
        const file = createMockFile('test.hl7', { patient_name: '' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBeUndefined();
      });

      it('returns undefined for whitespace-only name', () => {
        const file = createMockFile('test.hl7', { patient_name: '   ' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBeUndefined();
      });

      it('returns undefined when no name fields present', () => {
        const file = createMockFile('test.hl7', { someOtherField: 'value' });
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBeUndefined();
      });
    });

    describe('species extraction', () => {
      it('extracts species from species field', () => {
        const file = createMockFile('test.hl7', { species: 'Dog' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Dog');
      });

      it('extracts species from APNA field (Exigo format)', () => {
        const file = createMockFile('exigo.xml', { APNA: 'CAT' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Cat');
      });

      it('normalizes "dog" to "Dog"', () => {
        const file = createMockFile('test.hl7', { species: 'dog' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Dog');
      });

      it('normalizes "DOG" to "Dog"', () => {
        const file = createMockFile('test.hl7', { species: 'DOG' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Dog');
      });

      it('normalizes "canine" to "Dog"', () => {
        const file = createMockFile('test.hl7', { species: 'canine' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Dog');
      });

      it('normalizes "CANINE" to "Dog"', () => {
        const file = createMockFile('test.hl7', { species: 'CANINE' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Dog');
      });

      it('normalizes "cat" to "Cat"', () => {
        const file = createMockFile('test.hl7', { species: 'cat' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Cat');
      });

      it('normalizes "feline" to "Cat"', () => {
        const file = createMockFile('test.hl7', { species: 'feline' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Cat');
      });

      it('handles Exigo format "DOG (3p)" -> "Dog"', () => {
        const file = createMockFile('exigo.xml', { APNA: 'DOG (3p)' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Dog');
      });

      it('handles Exigo format "CAT (5-diff)" -> "Cat"', () => {
        const file = createMockFile('exigo.xml', { APNA: 'CAT (5-diff)' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Cat');
      });

      it('capitalizes other species correctly', () => {
        const file = createMockFile('test.hl7', { species: 'RABBIT' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Rabbit');
      });

      it('handles mixed case other species', () => {
        const file = createMockFile('test.hl7', { species: 'hAmStEr' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBe('Hamster');
      });

      it('returns undefined for empty species', () => {
        const file = createMockFile('test.hl7', { species: '' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBeUndefined();
      });

      it('returns undefined when no species fields present', () => {
        const file = createMockFile('test.hl7', { someOtherField: 'value' });
        const result = extractPatientDataFromFile(file);
        expect(result.species).toBeUndefined();
      });
    });

    describe('dateOfBirth extraction', () => {
      it('parses HL7 format YYYYMMDD', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '20200315' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBe('2020-03-15');
      });

      it('parses HL7 format YYYYMMDDHHmmss', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '20200315143022' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBe('2020-03-15');
      });

      it('parses HL7 format YYYYMMDDHHmm (10 digits)', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '2020031514' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBe('2020-03-15');
      });

      it('parses ISO format YYYY-MM-DD', () => {
        const file = createMockFile('test.json', { birth_date_alt: '2020-03-15' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBe('2020-03-15');
      });

      it('parses ISO format with time YYYY-MM-DDTHH:mm:ss', () => {
        const file = createMockFile('test.json', { birth_date_alt: '2020-03-15T14:30:22' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBe('2020-03-15');
      });

      it('extracts from birthDate field', () => {
        const file = createMockFile('test.json', { birthDate: '20200315' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBe('2020-03-15');
      });

      it('extracts from dateOfBirth field', () => {
        const file = createMockFile('test.json', { dateOfBirth: '20200315' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBe('2020-03-15');
      });

      it('validates year range (rejects year < 1900)', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '18990315' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });

      it('validates year range (rejects year > 2100)', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '21010315' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });

      it('validates month range (rejects month > 12)', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '20201315' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });

      it('validates month range (rejects month = 0)', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '20200015' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });

      it('validates day range (rejects day > 31)', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '20200332' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });

      it('validates day range (rejects day = 0)', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '20200300' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });

      it('returns undefined for invalid format', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: 'March 15 2020' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });

      it('returns undefined for empty date', () => {
        const file = createMockFile('test.hl7', { birth_date_alt: '' });
        const result = extractPatientDataFromFile(file);
        expect(result.dateOfBirth).toBeUndefined();
      });
    });

    describe('gender extraction', () => {
      it('extracts "M" as "Male"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'M' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Male');
      });

      it('extracts "MALE" as "Male"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'MALE' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Male');
      });

      it('extracts "male" as "Male"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'male' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Male');
      });

      it('extracts "F" as "Female"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'F' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Female');
      });

      it('extracts "FEMALE" as "Female"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'FEMALE' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Female');
      });

      it('extracts "O" as "Unknown"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'O' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Unknown');
      });

      it('extracts "U" as "Unknown"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'U' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Unknown');
      });

      it('extracts "UNKNOWN" as "Unknown"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'UNKNOWN' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Unknown');
      });

      it('extracts "OTHER" as "Unknown"', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'OTHER' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Unknown');
      });

      it('extracts from gender field', () => {
        const file = createMockFile('test.json', { gender: 'M' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Male');
      });

      it('prioritizes gender_alt over gender', () => {
        const file = createMockFile('test.hl7', {
          gender_alt: 'M',
          gender: 'F',
        });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBe('Male');
      });

      it('returns undefined for unrecognized gender', () => {
        const file = createMockFile('test.hl7', { gender_alt: 'X' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBeUndefined();
      });

      it('returns undefined for empty gender', () => {
        const file = createMockFile('test.hl7', { gender_alt: '' });
        const result = extractPatientDataFromFile(file);
        expect(result.gender).toBeUndefined();
      });
    });

    describe('sources tracking', () => {
      it('includes the file name in sources', () => {
        const file = createMockFile('blood_panel.hl7', { patient_name: 'Max' });
        const result = extractPatientDataFromFile(file);
        expect(result.sources).toEqual(['blood_panel.hl7']);
      });
    });

    describe('empty/missing testResults', () => {
      it('handles undefined testResults', () => {
        const file: PendingDeviceFile = {
          id: 'test',
          deviceType: 'test',
          deviceName: 'Test',
          connectionMethod: 'serial',
          fileName: 'test.txt',
          fileData: [],
          mimeType: 'text/plain',
          testResults: undefined,
          detectedAt: new Date().toISOString(),
        };
        const result = extractPatientDataFromFile(file);
        expect(result.name).toBeUndefined();
        expect(result.species).toBeUndefined();
        expect(result.dateOfBirth).toBeUndefined();
        expect(result.gender).toBeUndefined();
      });

      it('handles null testResults', () => {
        const file = createMockFile('test.txt', null as unknown as Record<string, unknown>);
        const result = extractPatientDataFromFile(file);
        expect(result.sources).toEqual(['test.txt']);
      });
    });
  });

  describe('aggregatePatientData', () => {
    it('returns empty sources for empty file list', () => {
      const result = aggregatePatientData([]);
      expect(result.sources).toEqual([]);
      expect(result.name).toBeUndefined();
    });

    it('returns data from single file', () => {
      const file = createMockFile('test.hl7', {
        patient_name: 'Max',
        species: 'Dog',
        birth_date_alt: '20200315',
        gender_alt: 'M',
      });
      const result = aggregatePatientData([file]);
      expect(result.name).toBe('Max');
      expect(result.species).toBe('Dog');
      expect(result.dateOfBirth).toBe('2020-03-15');
      expect(result.gender).toBe('Male');
      expect(result.sources).toEqual(['test.hl7']);
    });

    it('aggregates data from multiple files', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max', species: 'Dog' }),
        createMockFile('file2.hl7', { birth_date_alt: '20200315', gender_alt: 'M' }),
      ];
      const result = aggregatePatientData(files);
      expect(result.name).toBe('Max');
      expect(result.species).toBe('Dog');
      expect(result.dateOfBirth).toBe('2020-03-15');
      expect(result.gender).toBe('Male');
      expect(result.sources).toEqual(['file1.hl7', 'file2.hl7']);
    });

    it('uses first non-empty value when files conflict', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
      ];
      const result = aggregatePatientData(files);
      expect(result.name).toBe('Max'); // First wins
    });

    it('skips empty values to find first valid one', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: '' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
      ];
      const result = aggregatePatientData(files);
      expect(result.name).toBe('Bella');
    });

    it('skips files without the field', () => {
      const files = [
        createMockFile('file1.hl7', { species: 'Dog' }),
        createMockFile('file2.hl7', { patient_name: 'Max', species: 'Cat' }),
      ];
      const result = aggregatePatientData(files);
      expect(result.name).toBe('Max');
      expect(result.species).toBe('Dog'); // First file's species wins
    });
  });

  describe('detectPatientDataConflicts', () => {
    it('returns empty array for single file', () => {
      const file = createMockFile('test.hl7', { patient_name: 'Max' });
      const result = detectPatientDataConflicts([file]);
      expect(result).toEqual([]);
    });

    it('returns empty array when files have same values', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max', species: 'Dog' }),
        createMockFile('file2.hl7', { patient_name: 'Max', species: 'Dog' }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toEqual([]);
    });

    it('detects name conflict', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('name');
      expect(result[0].values).toEqual([
        { value: 'Max', source: 'file1.hl7' },
        { value: 'Bella', source: 'file2.hl7' },
      ]);
    });

    it('detects species conflict', () => {
      const files = [
        createMockFile('file1.hl7', { species: 'Dog' }),
        createMockFile('file2.hl7', { species: 'Cat' }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('species');
    });

    it('detects multiple conflicts', () => {
      const files = [
        createMockFile('file1.hl7', {
          patient_name: 'Max',
          species: 'Dog',
          gender_alt: 'M',
        }),
        createMockFile('file2.hl7', {
          patient_name: 'Bella',
          species: 'Cat',
          gender_alt: 'F',
        }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toHaveLength(3); // name, species, gender
      expect(result.map((c) => c.field).sort()).toEqual(['gender', 'name', 'species']);
    });

    it('ignores files with empty values', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: '' }),
        createMockFile('file3.hl7', { patient_name: 'Max' }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toEqual([]); // Only "Max" values, no conflict
    });

    it('ignores files with undefined values', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { someOtherField: 'value' }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toEqual([]);
    });

    it('detects conflict among three files', () => {
      const files = [
        createMockFile('file1.hl7', { patient_name: 'Max' }),
        createMockFile('file2.hl7', { patient_name: 'Bella' }),
        createMockFile('file3.hl7', { patient_name: 'Charlie' }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toHaveLength(1);
      expect(result[0].values).toHaveLength(3);
    });

    it('detects dateOfBirth conflict', () => {
      const files = [
        createMockFile('file1.hl7', { birth_date_alt: '20200315' }),
        createMockFile('file2.hl7', { birth_date_alt: '20190101' }),
      ];
      const result = detectPatientDataConflicts(files);
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('dateOfBirth');
    });
  });

  describe('hasExtractedData', () => {
    it('returns false for empty data', () => {
      const data = { sources: [] };
      expect(hasExtractedData(data)).toBe(false);
    });

    it('returns true when name is present', () => {
      const data = { name: 'Max', sources: ['test.hl7'] };
      expect(hasExtractedData(data)).toBe(true);
    });

    it('returns true when species is present', () => {
      const data = { species: 'Dog', sources: ['test.hl7'] };
      expect(hasExtractedData(data)).toBe(true);
    });

    it('returns true when dateOfBirth is present', () => {
      const data = { dateOfBirth: '2020-03-15', sources: ['test.hl7'] };
      expect(hasExtractedData(data)).toBe(true);
    });

    it('returns true when gender is present', () => {
      const data = { gender: 'Male' as const, sources: ['test.hl7'] };
      expect(hasExtractedData(data)).toBe(true);
    });

    it('returns false when only sources is present', () => {
      const data = { sources: ['test.hl7'] };
      expect(hasExtractedData(data)).toBe(false);
    });

    it('returns true when multiple fields are present', () => {
      const data = {
        name: 'Max',
        species: 'Dog',
        dateOfBirth: '2020-03-15',
        gender: 'Male' as const,
        sources: ['test.hl7'],
      };
      expect(hasExtractedData(data)).toBe(true);
    });
  });

  describe('real-world device scenarios', () => {
    it('handles PointCare chemistry HL7 message', () => {
      const file = createMockFile('pointcare_20240615.hl7', {
        patient_name: 'Max',
        species: 'canine',
        birth_date_alt: '20200315143022',
        gender_alt: 'M',
        // Additional test results
        GLU: '95',
        BUN: '18',
        CRE: '1.2',
      });
      const result = extractPatientDataFromFile(file);
      expect(result.name).toBe('Max');
      expect(result.species).toBe('Dog');
      expect(result.dateOfBirth).toBe('2020-03-15');
      expect(result.gender).toBe('Male');
    });

    it('handles Exigo hematology XML', () => {
      const file = createMockFile('exigo_cbc.xml', {
        ID2: 'Bella',
        APNA: 'CAT (5-diff)',
        // Exigo typically doesn't have DOB/gender
        WBC: '12.5',
        RBC: '8.2',
      });
      const result = extractPatientDataFromFile(file);
      expect(result.name).toBe('Bella');
      expect(result.species).toBe('Cat');
      expect(result.dateOfBirth).toBeUndefined();
      expect(result.gender).toBeUndefined();
    });

    it('handles Healvet immunoassay', () => {
      const file = createMockFile('healvet_panel.txt', {
        patient_name: 'Charlie',
        species: 'Dog',
        gender_alt: 'MALE',
        // Healvet panel results
        'T4-1': '2.5',
        'TSH-1': '0.15',
      });
      const result = extractPatientDataFromFile(file);
      expect(result.name).toBe('Charlie');
      expect(result.species).toBe('Dog');
      expect(result.gender).toBe('Male');
    });

    it('aggregates data from mixed device types', () => {
      const files = [
        createMockFile('pointcare.hl7', {
          patient_name: 'Luna',
          species: 'feline',
          birth_date_alt: '20210501',
        }),
        createMockFile('exigo.xml', {
          ID2: 'Luna',
          APNA: 'CAT',
        }),
      ];
      const result = aggregatePatientData(files);
      expect(result.name).toBe('Luna');
      expect(result.species).toBe('Cat');
      expect(result.dateOfBirth).toBe('2021-05-01');
      expect(result.sources).toEqual(['pointcare.hl7', 'exigo.xml']);
    });
  });
});
