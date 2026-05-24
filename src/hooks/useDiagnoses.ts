/**
 * React Query hooks for the diagnosis tag system.
 *
 * Two query patterns:
 *   1. `useDiagnoses(activeOnly)` — the master list, for the picker UI.
 *   2. `useDiagnosesForRecord(recordId)` — diagnoses attached to one
 *      medical record, used by the read-only tag displays in record
 *      detail and patient dashboard.
 *
 * Each is cached independently. Mutations elsewhere (create/update/
 * delete diagnosis or set_for_record) should invalidate the relevant
 * key — see DIAGNOSES_KEYS at the top so all callers reference the
 * same string keys without typo risk.
 */

import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/services/invoke';

export interface Diagnosis {
  id: number;
  name: string;
  description?: string | null;
  color?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DIAGNOSES_KEYS = {
  all: ['diagnoses'] as const,
  list: (activeOnly: boolean) => ['diagnoses', 'list', activeOnly] as const,
  forRecord: (recordId: number) => ['diagnoses', 'record', recordId] as const,
};

/** All diagnoses in the master list. Filters to active by default —
 *  pass `false` for the Settings page to see inactive ones too. */
export function useDiagnoses(activeOnly = true) {
  return useQuery({
    queryKey: DIAGNOSES_KEYS.list(activeOnly),
    queryFn: () => invoke<Diagnosis[]>('get_diagnoses', { activeOnly }),
    // Diagnoses don't change often once configured; 30s staleness is
    // friendly to the user (no flicker on tab switches) without going
    // stale enough to confuse anyone editing the list right now.
    staleTime: 30_000,
  });
}

/** Diagnoses currently linked to a specific medical record. Includes
 *  inactive ones so historical records still show their full original
 *  tag set with proper labels and colors. */
export function useDiagnosesForRecord(recordId: number | null | undefined) {
  return useQuery({
    queryKey: DIAGNOSES_KEYS.forRecord(recordId ?? 0),
    queryFn: () =>
      invoke<Diagnosis[]>('get_diagnoses_for_record', {
        medicalRecordId: recordId,
      }),
    // Skip the fetch entirely when there's no record id (e.g. while a
    // detail modal is closed).
    enabled: recordId != null && recordId > 0,
    // Same staleness reasoning as the master list — record tag sets
    // are stable once saved, and an explicit invalidation runs from
    // set_diagnoses_for_record's caller path.
    staleTime: 30_000,
  });
}
