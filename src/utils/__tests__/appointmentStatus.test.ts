import { describe, it, expect } from 'vitest';
import {
  statusLabelKey,
  statusColor,
  isClosedStatus,
  nextStatuses,
  waitingMinutes,
  statusActionKey,
} from '../appointmentStatus';

describe('appointment status helpers', () => {
  it('names every status with an appointments:status key', () => {
    expect(statusLabelKey('scheduled')).toBe('appointments:status.scheduled');
    expect(statusLabelKey('checked_in')).toBe('appointments:status.checkedIn');
    expect(statusLabelKey('in_progress')).toBe('appointments:status.inProgress');
    expect(statusLabelKey('completed')).toBe('appointments:status.completed');
    expect(statusLabelKey('cancelled')).toBe('appointments:status.cancelled');
    expect(statusLabelKey('no_show')).toBe('appointments:status.noShow');
  });

  it('gives each status its own colour', () => {
    const colours = ['scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'].map((s) =>
      statusColor(s as never),
    );
    expect(new Set(colours.slice(0, 4)).size).toBe(4);
  });

  it('treats cancelled and no-show as closed', () => {
    expect(isClosedStatus('cancelled')).toBe(true);
    expect(isClosedStatus('no_show')).toBe(true);
    expect(isClosedStatus('checked_in')).toBe(false);
    expect(isClosedStatus('completed')).toBe(false);
  });

  it('offers the next step of the visit first', () => {
    expect(nextStatuses('scheduled')[0]).toBe('checked_in');
    expect(nextStatuses('checked_in')[0]).toBe('in_progress');
    expect(nextStatuses('in_progress')[0]).toBe('completed');
    expect(nextStatuses('cancelled')).toEqual(['scheduled']);
    expect(nextStatuses('no_show')).toEqual(['scheduled']);
  });

  it('offers no-show and cancel only before the patient is seen', () => {
    expect(nextStatuses('scheduled')).toEqual(expect.arrayContaining(['no_show', 'cancelled']));
    expect(nextStatuses('in_progress')).not.toContain('no_show');
    expect(nextStatuses('completed')).not.toContain('cancelled');
  });

  it('counts whole minutes since check-in', () => {
    const now = new Date('2030-01-10T10:30:00Z');
    expect(waitingMinutes('2030-01-10T10:12:30Z', now)).toBe(17);
    expect(waitingMinutes(undefined, now)).toBeNull();
    expect(waitingMinutes('2030-01-10T10:40:00Z', now)).toBe(0);
  });

  it('calls taking a finished visit back "back to exam", not "start exam"', () => {
    expect(statusActionKey('in_progress', 'completed')).toBe('appointments:actions.backToConsult');
    expect(statusActionKey('in_progress', 'checked_in')).toBe('appointments:actions.startConsult');
  });
});

