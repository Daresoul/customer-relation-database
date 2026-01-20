/**
 * Unit Tests for caseTransform Utility
 * Tests for snake_case <-> camelCase transformation functions
 */

import { describe, it, expect } from 'vitest';
import {
  snakeToCamel,
  camelToSnake,
  snakeToCamelObject,
  camelToSnakeObject,
  transformKeys,
} from '../../src/utils/caseTransform';

describe('caseTransform Utility', () => {
  describe('snakeToCamel', () => {
    it('converts simple snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
    });

    it('converts multiple underscores', () => {
      expect(snakeToCamel('patient_medical_record')).toBe('patientMedicalRecord');
    });

    it('handles single word (no underscores)', () => {
      expect(snakeToCamel('patient')).toBe('patient');
    });

    it('handles empty string', () => {
      expect(snakeToCamel('')).toBe('');
    });

    it('handles string starting with underscore', () => {
      expect(snakeToCamel('_private_field')).toBe('PrivateField');
    });

    it('handles string ending with underscore', () => {
      expect(snakeToCamel('field_')).toBe('field_');
    });

    it('handles consecutive underscores', () => {
      expect(snakeToCamel('hello__world')).toBe('hello_World');
    });

    it('handles all lowercase with numbers', () => {
      expect(snakeToCamel('patient_id_123')).toBe('patientId_123');
    });
  });

  describe('camelToSnake', () => {
    it('converts simple camelCase to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
    });

    it('converts multiple capital letters', () => {
      expect(camelToSnake('patientMedicalRecord')).toBe('patient_medical_record');
    });

    it('handles single word (no capitals)', () => {
      expect(camelToSnake('patient')).toBe('patient');
    });

    it('handles empty string', () => {
      expect(camelToSnake('')).toBe('');
    });

    it('handles string starting with capital (PascalCase)', () => {
      expect(camelToSnake('PatientRecord')).toBe('_patient_record');
    });

    it('handles consecutive capitals (acronyms)', () => {
      expect(camelToSnake('parseXMLDocument')).toBe('parse_x_m_l_document');
    });

    it('handles numbers in string', () => {
      expect(camelToSnake('patientId123')).toBe('patient_id123');
    });
  });

  describe('snakeToCamelObject', () => {
    it('transforms flat object keys', () => {
      const input = {
        patient_id: 1,
        first_name: 'Max',
        last_name: 'Smith',
      };
      const expected = {
        patientId: 1,
        firstName: 'Max',
        lastName: 'Smith',
      };
      expect(snakeToCamelObject(input)).toEqual(expected);
    });

    it('transforms nested objects', () => {
      const input = {
        patient_info: {
          first_name: 'Max',
          owner_data: {
            phone_number: '555-1234',
          },
        },
      };
      const expected = {
        patientInfo: {
          firstName: 'Max',
          ownerData: {
            phoneNumber: '555-1234',
          },
        },
      };
      expect(snakeToCamelObject(input)).toEqual(expected);
    });

    it('transforms arrays of objects', () => {
      const input = [
        { patient_id: 1, patient_name: 'Max' },
        { patient_id: 2, patient_name: 'Bella' },
      ];
      const expected = [
        { patientId: 1, patientName: 'Max' },
        { patientId: 2, patientName: 'Bella' },
      ];
      expect(snakeToCamelObject(input)).toEqual(expected);
    });

    it('handles nested arrays', () => {
      const input = {
        patient_records: [
          { record_id: 1, record_type: 'procedure' },
          { record_id: 2, record_type: 'note' },
        ],
      };
      const expected = {
        patientRecords: [
          { recordId: 1, recordType: 'procedure' },
          { recordId: 2, recordType: 'note' },
        ],
      };
      expect(snakeToCamelObject(input)).toEqual(expected);
    });

    it('handles null values', () => {
      expect(snakeToCamelObject(null as any)).toBeNull();
    });

    it('handles undefined values', () => {
      expect(snakeToCamelObject(undefined as any)).toBeUndefined();
    });

    it('preserves primitive values', () => {
      expect(snakeToCamelObject('string' as any)).toBe('string');
      expect(snakeToCamelObject(123 as any)).toBe(123);
      expect(snakeToCamelObject(true as any)).toBe(true);
    });

    it('preserves null values in object properties', () => {
      const input = {
        patient_name: 'Max',
        microchip_id: null,
      };
      const expected = {
        patientName: 'Max',
        microchipId: null,
      };
      expect(snakeToCamelObject(input)).toEqual(expected);
    });

    it('handles empty objects', () => {
      expect(snakeToCamelObject({})).toEqual({});
    });

    it('handles empty arrays', () => {
      expect(snakeToCamelObject([])).toEqual([]);
    });
  });

  describe('camelToSnakeObject', () => {
    it('transforms flat object keys', () => {
      const input = {
        patientId: 1,
        firstName: 'Max',
        lastName: 'Smith',
      };
      const expected = {
        patient_id: 1,
        first_name: 'Max',
        last_name: 'Smith',
      };
      expect(camelToSnakeObject(input)).toEqual(expected);
    });

    it('transforms nested objects', () => {
      const input = {
        patientInfo: {
          firstName: 'Max',
          ownerData: {
            phoneNumber: '555-1234',
          },
        },
      };
      const expected = {
        patient_info: {
          first_name: 'Max',
          owner_data: {
            phone_number: '555-1234',
          },
        },
      };
      expect(camelToSnakeObject(input)).toEqual(expected);
    });

    it('transforms arrays of objects', () => {
      const input = [
        { patientId: 1, patientName: 'Max' },
        { patientId: 2, patientName: 'Bella' },
      ];
      const expected = [
        { patient_id: 1, patient_name: 'Max' },
        { patient_id: 2, patient_name: 'Bella' },
      ];
      expect(camelToSnakeObject(input)).toEqual(expected);
    });

    it('handles null values', () => {
      expect(camelToSnakeObject(null as any)).toBeNull();
    });

    it('handles undefined values', () => {
      expect(camelToSnakeObject(undefined as any)).toBeUndefined();
    });

    it('handles empty objects', () => {
      expect(camelToSnakeObject({})).toEqual({});
    });
  });

  describe('transformKeys', () => {
    it('transforms to camelCase with snakeToCamel direction', () => {
      const input = { patient_id: 1, record_type: 'procedure' };
      const result = transformKeys<{ patientId: number; recordType: string }>(
        input,
        'snakeToCamel'
      );
      expect(result).toEqual({ patientId: 1, recordType: 'procedure' });
    });

    it('transforms to snake_case with camelToSnake direction', () => {
      const input = { patientId: 1, recordType: 'procedure' };
      const result = transformKeys<{ patient_id: number; record_type: string }>(
        input,
        'camelToSnake'
      );
      expect(result).toEqual({ patient_id: 1, record_type: 'procedure' });
    });
  });

  describe('real-world API response scenarios', () => {
    it('transforms typical appointment response from backend', () => {
      const backendResponse = {
        id: 1,
        patient_id: 42,
        start_time: '2024-06-15T10:00:00Z',
        end_time: '2024-06-15T10:30:00Z',
        room_id: 1,
        created_at: '2024-06-14T09:00:00Z',
        updated_at: '2024-06-14T09:00:00Z',
        deleted_at: null,
        created_by: 'admin',
        patient_name: 'Max',
        species: 'Dog',
        breed: 'Labrador',
        microchip_id: '123456789',
      };

      const result = snakeToCamelObject(backendResponse);

      expect(result).toHaveProperty('patientId', 42);
      expect(result).toHaveProperty('startTime', '2024-06-15T10:00:00Z');
      expect(result).toHaveProperty('endTime', '2024-06-15T10:30:00Z');
      expect(result).toHaveProperty('roomId', 1);
      expect(result).toHaveProperty('createdAt', '2024-06-14T09:00:00Z');
      expect(result).toHaveProperty('deletedAt', null);
      expect(result).toHaveProperty('patientName', 'Max');
      expect(result).toHaveProperty('microchipId', '123456789');
    });

    it('transforms create appointment input for backend', () => {
      const frontendInput = {
        patientId: 42,
        title: 'Annual Checkup',
        description: 'Regular examination',
        startTime: '2024-06-15T10:00:00Z',
        endTime: '2024-06-15T10:30:00Z',
        roomId: 1,
      };

      const result = camelToSnakeObject(frontendInput);

      expect(result).toHaveProperty('patient_id', 42);
      expect(result).toHaveProperty('start_time', '2024-06-15T10:00:00Z');
      expect(result).toHaveProperty('end_time', '2024-06-15T10:30:00Z');
      expect(result).toHaveProperty('room_id', 1);
    });

    it('transforms paginated response with nested data', () => {
      const backendResponse = {
        appointments: [
          { id: 1, patient_id: 1, patient_name: 'Max' },
          { id: 2, patient_id: 2, patient_name: 'Bella' },
        ],
        total: 2,
        has_more: false,
      };

      const result = snakeToCamelObject(backendResponse);

      expect(result).toHaveProperty('hasMore', false);
      expect(result.appointments).toHaveLength(2);
      expect(result.appointments[0]).toHaveProperty('patientId', 1);
      expect(result.appointments[0]).toHaveProperty('patientName', 'Max');
    });
  });
});
