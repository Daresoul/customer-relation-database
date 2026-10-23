import { useQuery } from '@tanstack/react-query';
import { labResultsService } from '../services/labResultsService';

/**
 * Lab values change when a result is attached, moved or deleted. These read
 * fresh on every mount (staleTime 0) and are listed in hooks/invalidation.ts.
 */
export function usePatientLabResults(patientId: number) {
  return useQuery({
    queryKey: ['patient-labs', patientId],
    queryFn: () => labResultsService.forPatient(patientId),
    enabled: patientId > 0,
    staleTime: 0,
  });
}

/** `attachmentsKey` changes when the record's attachments do, so the values follow. */
export function useRecordLabValues(recordId: number, attachmentsKey: string) {
  return useQuery({
    queryKey: ['record-labs', recordId, attachmentsKey],
    queryFn: () => labResultsService.forRecord(recordId),
    enabled: recordId > 0,
    staleTime: 0,
  });
}
