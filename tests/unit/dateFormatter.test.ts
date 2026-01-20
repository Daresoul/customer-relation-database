/**
 * Unit Tests for dateFormatter Utility
 * Tests for date formatting functions based on user preferences
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dayjs from 'dayjs';
import {
  getUserDateFormat,
  formatDate,
  formatDateTime,
  formatDayjs,
  getDatePickerFormat,
  updateDateFormatInStorage,
} from '../../src/utils/dateFormatter';

describe('dateFormatter Utility', () => {
  // Mock localStorage for Node.js environment
  let localStorageMock: { [key: string]: string } = {};

  const mockLocalStorage = {
    getItem: (key: string) => localStorageMock[key] || null,
    setItem: (key: string, value: string) => {
      localStorageMock[key] = value;
    },
    removeItem: (key: string) => {
      delete localStorageMock[key];
    },
    clear: () => {
      localStorageMock = {};
    },
    length: 0,
    key: () => null,
  };

  beforeEach(() => {
    localStorageMock = {};
    // @ts-ignore - mocking global localStorage
    global.localStorage = mockLocalStorage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserDateFormat', () => {
    it('returns default format when no settings exist', () => {
      expect(getUserDateFormat()).toBe('MM/DD/YYYY');
    });

    it('returns format from settings', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'DD/MM/YYYY',
      });
      expect(getUserDateFormat()).toBe('DD/MM/YYYY');
    });

    it('returns default when settings is invalid JSON', () => {
      localStorageMock['veterinary-clinic-settings'] = 'invalid json';
      expect(getUserDateFormat()).toBe('MM/DD/YYYY');
    });

    it('returns default when dateFormat not in settings', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        someOtherSetting: 'value',
      });
      expect(getUserDateFormat()).toBe('MM/DD/YYYY');
    });

    it('supports various date formats', () => {
      const formats = [
        'MM/DD/YYYY',
        'DD/MM/YYYY',
        'YYYY-MM-DD',
        'DD.MM.YYYY',
        'YYYY/MM/DD',
      ];

      for (const format of formats) {
        localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
          dateFormat: format,
        });
        expect(getUserDateFormat()).toBe(format);
      }
    });
  });

  describe('formatDate', () => {
    beforeEach(() => {
      // Set a known format for consistent testing
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'MM/DD/YYYY',
      });
    });

    it('formats Date object', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      const result = formatDate(date);
      expect(result).toBe('06/15/2024');
    });

    it('formats ISO date string', () => {
      const result = formatDate('2024-06-15');
      expect(result).toBe('06/15/2024');
    });

    it('formats ISO datetime string', () => {
      const result = formatDate('2024-06-15T10:30:00Z');
      expect(result).toBe('06/15/2024');
    });

    it('returns empty string for null', () => {
      expect(formatDate(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDate(undefined)).toBe('');
    });

    it('uses user format from settings', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'DD/MM/YYYY',
      });
      const result = formatDate('2024-06-15');
      expect(result).toBe('15/06/2024');
    });

    it('uses ISO format when set', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'YYYY-MM-DD',
      });
      const result = formatDate('2024-06-15');
      expect(result).toBe('2024-06-15');
    });

    it('uses European format with dots', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'DD.MM.YYYY',
      });
      const result = formatDate('2024-06-15');
      expect(result).toBe('15.06.2024');
    });
  });

  describe('formatDateTime', () => {
    beforeEach(() => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'MM/DD/YYYY',
      });
    });

    it('formats Date object with time', () => {
      const date = new Date('2024-06-15T10:30:00');
      const result = formatDateTime(date);
      expect(result).toMatch(/06\/15\/2024 \d{2}:\d{2}/);
    });

    it('formats ISO datetime string', () => {
      // Use a fixed local time to avoid timezone issues
      const result = formatDateTime('2024-06-15T10:30:00');
      expect(result).toMatch(/06\/15\/2024 10:30/);
    });

    it('returns empty string for null', () => {
      expect(formatDateTime(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDateTime(undefined)).toBe('');
    });

    it('uses user format from settings for date part', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'DD/MM/YYYY',
      });
      const result = formatDateTime('2024-06-15T10:30:00');
      expect(result).toMatch(/15\/06\/2024 10:30/);
    });

    it('includes 24-hour time format', () => {
      const result = formatDateTime('2024-06-15T14:30:00');
      expect(result).toContain('14:30');
    });
  });

  describe('formatDayjs', () => {
    beforeEach(() => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'MM/DD/YYYY',
      });
    });

    it('formats dayjs object', () => {
      const date = dayjs('2024-06-15');
      const result = formatDayjs(date);
      expect(result).toBe('06/15/2024');
    });

    it('returns empty string for null', () => {
      expect(formatDayjs(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDayjs(undefined)).toBe('');
    });

    it('uses user format from settings', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'YYYY-MM-DD',
      });
      const date = dayjs('2024-06-15');
      const result = formatDayjs(date);
      expect(result).toBe('2024-06-15');
    });
  });

  describe('getDatePickerFormat', () => {
    it('returns format for DatePicker component', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'MM/DD/YYYY',
      });
      expect(getDatePickerFormat()).toBe('MM/DD/YYYY');
    });

    it('preserves DD/MM/YYYY format', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'DD/MM/YYYY',
      });
      expect(getDatePickerFormat()).toBe('DD/MM/YYYY');
    });

    it('preserves YYYY-MM-DD format', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'YYYY-MM-DD',
      });
      expect(getDatePickerFormat()).toBe('YYYY-MM-DD');
    });
  });

  describe('updateDateFormatInStorage', () => {
    it('stores new format', () => {
      updateDateFormatInStorage('DD/MM/YYYY');
      const stored = JSON.parse(localStorageMock['veterinary-clinic-settings']);
      expect(stored.dateFormat).toBe('DD/MM/YYYY');
    });

    it('preserves other settings', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        otherSetting: 'value',
        dateFormat: 'MM/DD/YYYY',
      });
      updateDateFormatInStorage('YYYY-MM-DD');
      const stored = JSON.parse(localStorageMock['veterinary-clinic-settings']);
      expect(stored.dateFormat).toBe('YYYY-MM-DD');
      expect(stored.otherSetting).toBe('value');
    });

    it('handles invalid existing settings', () => {
      localStorageMock['veterinary-clinic-settings'] = 'invalid json';
      updateDateFormatInStorage('DD/MM/YYYY');
      const stored = JSON.parse(localStorageMock['veterinary-clinic-settings']);
      expect(stored.dateFormat).toBe('DD/MM/YYYY');
    });

    it('creates settings if none exist', () => {
      updateDateFormatInStorage('YYYY-MM-DD');
      const stored = JSON.parse(localStorageMock['veterinary-clinic-settings']);
      expect(stored.dateFormat).toBe('YYYY-MM-DD');
    });
  });

  describe('format consistency', () => {
    it('all formatters use same user format', () => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'DD.MM.YYYY',
      });

      const date = new Date('2024-06-15T10:30:00');
      const dayjsDate = dayjs('2024-06-15');

      expect(formatDate(date)).toBe('15.06.2024');
      expect(formatDayjs(dayjsDate)).toBe('15.06.2024');
      expect(formatDateTime(date)).toContain('15.06.2024');
    });

    it('changes propagate to all formatters', () => {
      // Start with one format
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'MM/DD/YYYY',
      });
      expect(formatDate('2024-06-15')).toBe('06/15/2024');

      // Change format
      updateDateFormatInStorage('YYYY-MM-DD');
      expect(formatDate('2024-06-15')).toBe('2024-06-15');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      localStorageMock['veterinary-clinic-settings'] = JSON.stringify({
        dateFormat: 'MM/DD/YYYY',
      });
    });

    it('handles leap year date', () => {
      expect(formatDate('2024-02-29')).toBe('02/29/2024');
    });

    it('handles year boundary', () => {
      expect(formatDate('2024-12-31')).toBe('12/31/2024');
      expect(formatDate('2025-01-01')).toBe('01/01/2025');
    });

    it('handles old date', () => {
      expect(formatDate('1990-05-20')).toBe('05/20/1990');
    });

    it('handles future date', () => {
      expect(formatDate('2030-12-25')).toBe('12/25/2030');
    });
  });
});
