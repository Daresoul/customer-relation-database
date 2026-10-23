import { describe, it, expect, afterEach } from 'vitest';
import { getUserDateFormat, formatDate, formatDayMonth } from '../dateFormatter';

// settings.md #17: the clinic is in North Macedonia and writes 31.01.2024.
describe('date format default', () => {
  afterEach(() => localStorage.clear());

  it('is day.month.year when nothing is saved yet', () => {
    expect(getUserDateFormat()).toBe('DD.MM.YYYY');
    expect(formatDate('2024-01-31T10:00:00')).toBe('31.01.2024');
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
