import { describe, it, expect, afterEach } from 'vitest';
import { getUserDateFormat, formatDate } from '../dateFormatter';

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
