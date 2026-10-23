import type { AppointmentStatus } from '../types/appointments';

export const statusLabelKey = (_s: AppointmentStatus): string => '';
export const statusColor = (_s: AppointmentStatus): string => '';
export const isClosedStatus = (_s: AppointmentStatus): boolean => false;
export const nextStatuses = (_s: AppointmentStatus): AppointmentStatus[] => [];
export const waitingMinutes = (_at: string | null | undefined, _now: Date = new Date()): number | null => null;
