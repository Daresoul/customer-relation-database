export interface RecentPatient {
  id: number;
  name: string | null;
  species?: string | null;
  ownerName?: string | null;
}

export const RECENT_PATIENTS_KEY = 'arkivet.recentPatients';

export function loadRecentPatients(): RecentPatient[] {
  return [];
}

export function rememberPatient(_patient: RecentPatient): void {}
