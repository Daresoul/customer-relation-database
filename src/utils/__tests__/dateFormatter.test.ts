import { describe, it, expect, afterEach } from 'vitest';
import { getUserDateFormat, formatDate, formatDayMonth, fromSqliteUtc } from '../dateFormatter';

// The clinic writes 31/01/2024, as its PDFs do.
describe('date format default', () => {
  afterEach(() => localStorage.clear());

  it('is day/month/year when nothing is saved yet', () => {
    expect(getUserDateFormat()).toBe('DD/MM/YYYY');
    expect(formatDate('2024-01-31T10:00:00')).toBe('31/01/2024');
  });

  it('follows the saved setting', () => {
    localStorage.setItem('veterinary-clinic-settings', JSON.stringify({ dateFormat: 'YYYY-MM-DD' }));
    expect(getUserDateFormat()).toBe('YYYY-MM-DD');
  });
});

// "Last result 23/10 14:05": day and month in the clinic's chosen order.
describe('formatDayMonth', () => {
  afterEach(() => localStorage.clear());
  const at = '2024-01-31T14:05:00';
  const withFormat = (dateFormat: string) =>
    localStorage.setItem('veterinary-clinic-settings', JSON.stringify({ dateFormat }));

  it('drops the year from the chosen format', () => {
    withFormat('DD/MM/YYYY');
    expect(formatDayMonth(at)).toBe('31/01');
    withFormat('DD.MM.YYYY');
    expect(formatDayMonth(at)).toBe('31.01');
    withFormat('MM/DD/YYYY');
    expect(formatDayMonth(at)).toBe('01/31');
    withFormat('YYYY-MM-DD');
    expect(formatDayMonth(at)).toBe('01-31');
  });

  it('adds the time when asked', () => {
    withFormat('DD/MM/YYYY');
    expect(formatDayMonth(at, true)).toBe('31/01 14:05');
  });
});

// Final review (low): SQLite's CURRENT_TIMESTAMP is UTC with no zone; read
// as local time, "Synced with Google at" showed 1–2 hours early.
describe('fromSqliteUtc', () => {
  it('reads a zone-less SQLite time as UTC and leaves a zoned one alone', () => {
    expect(fromSqliteUtc('2026-10-31 12:05:00')).toBe('2026-10-31T12:05:00Z');
    expect(fromSqliteUtc('2026-10-31T12:05:00+01:00')).toBe('2026-10-31T12:05:00+01:00');
    expect(fromSqliteUtc('2026-10-31T12:05:00Z')).toBe('2026-10-31T12:05:00Z');
  });
});
