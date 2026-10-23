import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/services/invoke';

/** One row of `global_patient_search` (pet by name or chip, or an owner's pets by name or phone). */
export interface PatientSearchHit {
  patientId: number;
  patientName: string | null;
  species: string | null;
  microchipId: string | null;
  isActive: boolean;
  householdId: number | null;
  ownerName: string | null;
  ownerPhone: string | null;
}

export const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 20;

export function searchPatientsEverywhere(query: string): Promise<PatientSearchHit[]> {
  return invoke<PatientSearchHit[]>('global_patient_search', { query, limit: SEARCH_LIMIT });
}

/** Under the `patients` key, so any patient change refreshes open results. */
export function usePatientSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['patients', 'globalSearch', q],
    queryFn: () => searchPatientsEverywhere(q),
    enabled: q.length >= MIN_QUERY_LENGTH,
    staleTime: 0,
  });
}
