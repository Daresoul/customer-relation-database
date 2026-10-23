import type { AppointmentStatus } from '../types/appointments';

const LABEL_KEY: Record<AppointmentStatus, string> = {
  scheduled: 'appointments:status.scheduled',
  checked_in: 'appointments:status.checkedIn',
  in_progress: 'appointments:status.inProgress',
  completed: 'appointments:status.completed',
  cancelled: 'appointments:status.cancelled',
  no_show: 'appointments:status.noShow',
};

/** antd Tag colours; the same colour marks the card edge. */
const COLOR: Record<AppointmentStatus, string> = {
  scheduled: 'blue',
  checked_in: 'gold',
  in_progress: 'purple',
  completed: 'green',
  cancelled: 'default',
  no_show: 'red',
};

/** One-click moves offered from each status; the next step of the visit first. */
const NEXT: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['checked_in', 'in_progress', 'no_show', 'cancelled'],
  checked_in: ['in_progress', 'scheduled', 'no_show', 'cancelled'],
  in_progress: ['completed', 'checked_in'],
  completed: ['in_progress'],
  cancelled: ['scheduled'],
  no_show: ['scheduled'],
};

/** The button label for moving a visit to `status`. */
const ACTION_KEY: Record<AppointmentStatus, string> = {
  scheduled: 'appointments:actions.reopen',
  checked_in: 'appointments:actions.checkIn',
  in_progress: 'appointments:actions.startConsult',
  completed: 'appointments:actions.markDone',
  cancelled: 'appointments:actions.cancelAppointment',
  no_show: 'appointments:actions.markNoShow',
};

export const statusLabelKey = (status: AppointmentStatus): string =>
  LABEL_KEY[status] ?? LABEL_KEY.scheduled;

export const statusColor = (status: AppointmentStatus): string => COLOR[status] ?? 'default';

/** Cancelled and no-show visits did not happen; they show greyed and struck out. */
export const isClosedStatus = (status: AppointmentStatus): boolean =>
  status === 'cancelled' || status === 'no_show';

export const nextStatuses = (status: AppointmentStatus): AppointmentStatus[] => NEXT[status] ?? [];

export const statusActionKey = (target: AppointmentStatus): string => ACTION_KEY[target];

/** Whole minutes since check-in; null when not checked in. */
export const waitingMinutes = (checkedInAt: string | null | undefined, now: Date = new Date()): number | null => {
  if (!checkedInAt) return null;
  const since = new Date(checkedInAt).getTime();
  if (Number.isNaN(since)) return null;
  return Math.max(0, Math.floor((now.getTime() - since) / 60_000));
};
