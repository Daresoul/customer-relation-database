import type { QueryClient } from '@tanstack/react-query';

/**
 * Who reads patient and household data from the cache. A save calls one of
 * these so every page showing the same data refreshes, instead of waiting out
 * the 5-minute staleTime. Only mounted queries refetch, so broad is cheap.
 *
 *   patients            appointment patient picker, lab-import picker
 *   patient/:id         patient page, including its owner block
 *   household/:id       household page (people, pet count)
 *   household-patients  household pets list
 *   households, all-households, household-search, household-quick-search
 *                       household lists and pickers
 *   appointments        calendar (patient names; removed with a deleted patient)
 */
const PATIENT_READERS = ['patients', 'patient', 'household-patients', 'household', 'appointments'];
const HOUSEHOLD_READERS = [
  'household',
  'households',
  'all-households',
  'household-search',
  'household-quick-search',
  'patient',
  'patients',
];

export function invalidatePatientData(queryClient: QueryClient): void {
  PATIENT_READERS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

export function invalidateHouseholdData(queryClient: QueryClient): void {
  HOUSEHOLD_READERS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}
