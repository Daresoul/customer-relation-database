/**
 * The last patients opened on this computer, newest first. Kept in
 * localStorage: a per-machine convenience, so a blocked or broken store only
 * means an empty list.
 */
export interface RecentPatient {
  id: number;
  name: string | null;
  species?: string | null;
  ownerName?: string | null;
}

export const RECENT_PATIENTS_KEY = 'arkivet.recentPatients';
export const RECENT_PATIENTS_EVENT = 'recent-patients-changed';
const MAX_RECENT = 8;

export function loadRecentPatients(): RecentPatient[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_PATIENTS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is RecentPatient => typeof p?.id === 'number').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberPatient(patient: RecentPatient): void {
  const next = [patient, ...loadRecentPatients().filter((p) => p.id !== patient.id)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_PATIENTS_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(RECENT_PATIENTS_EVENT));
}
