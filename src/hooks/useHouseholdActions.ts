import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HouseholdService } from '../services/householdService';
import { invalidateHouseholdData, invalidatePatientData } from './invalidation';

/**
 * Household-level writes that change which household people and pets belong
 * to. Each refreshes both household and patient readers. Callers own the
 * success and error messages (`mutateAsync`).
 */
function useHouseholdWrite<A>(write: (args: A) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => {
      invalidateHouseholdData(queryClient);
      invalidatePatientData(queryClient);
    },
  });
}

export function useMergeHouseholds() {
  return useHouseholdWrite(({ keepId, mergeId, detailsFrom }: { keepId: number; mergeId: number; detailsFrom: number }) =>
    HouseholdService.mergeHouseholds(keepId, mergeId, detailsFrom),
  );
}

export function useMovePatient() {
  return useHouseholdWrite(({ patientId, householdId }: { patientId: number; householdId: number }) =>
    HouseholdService.movePatient(patientId, householdId),
  );
}

export function useDeleteHouseholdById() {
  return useHouseholdWrite((householdId: number) => HouseholdService.deleteHousehold(householdId));
}

export function useSetPrimaryPerson() {
  return useHouseholdWrite((personId: number) => HouseholdService.setPrimaryPerson(personId));
}
