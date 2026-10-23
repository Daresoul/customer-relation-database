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
 *   patient-weights     weight log and trend on the patient page
 */
const PATIENT_READERS = ['patients', 'patient', 'household-patients', 'household', 'appointments', 'patient-weights'];
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

/**
 * Lab results: a result arriving, discarded, restored, attached or moved.
 *
 *   lab-inbox, lab-inbox-count   lab inbox list and its "N waiting" badge
 *   medical-record(s), medical-records-search
 *                                record page attachments and record lists
 *                                (a move or attach changes two records)
 *   patient-labs, record-labs    Labs tab and the record page's lab values
 *                                (useLabResults; both also refetch on mount)
 */
const LAB_INBOX_READERS = ['lab-inbox', 'lab-inbox-count'];
const LAB_RECORD_READERS = ['medical-record', 'medical-records', 'medical-records-search', 'patient-labs', 'record-labs'];

export function invalidateLabInboxData(queryClient: QueryClient): void {
  LAB_INBOX_READERS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

export function invalidateLabResultRecords(queryClient: QueryClient): void {
  [...LAB_INBOX_READERS, ...LAB_RECORD_READERS].forEach((key) =>
    queryClient.invalidateQueries({ queryKey: [key] }),
  );
}
