import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRecentPatients, rememberPatient, RECENT_PATIENTS_KEY } from '../recentPatients';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('recently viewed patients', () => {
  it('is empty at first', () => {
    expect(loadRecentPatients()).toEqual([]);
  });

  it('puts the latest patient first and lists each patient once', () => {
    rememberPatient({ id: 1, name: 'Rex' });
    rememberPatient({ id: 2, name: 'Bella' });
    rememberPatient({ id: 1, name: 'Rex' });

    expect(loadRecentPatients().map((p) => p.id)).toEqual([1, 2]);
  });

  it('keeps the last 8', () => {
    for (let id = 1; id <= 10; id++) rememberPatient({ id, name: `Pet ${id}` });

    expect(loadRecentPatients().map((p) => p.id)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('keeps the newest name and owner for a patient seen again', () => {
    rememberPatient({ id: 1, name: 'Rex', ownerName: 'Ана' });
    rememberPatient({ id: 1, name: 'Rexy', ownerName: 'Ана Петровска' });

    expect(loadRecentPatients()).toEqual([{ id: 1, name: 'Rexy', ownerName: 'Ана Петровска' }]);
  });

  it('survives a broken or blocked storage', () => {
    localStorage.setItem(RECENT_PATIENTS_KEY, '{not json');
    expect(loadRecentPatients()).toEqual([]);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberPatient({ id: 1, name: 'Rex' })).not.toThrow();
  });

  it('tells listeners when the list changes', () => {
    const listener = vi.fn();
    window.addEventListener('recent-patients-changed', listener);
    rememberPatient({ id: 1, name: 'Rex' });
    window.removeEventListener('recent-patients-changed', listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
