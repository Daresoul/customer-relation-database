/**
 * Patient data management hook using React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { PatientWithOwners, CreatePatientInput, UpdatePatientInput } from '../types';
import { PatientService } from '../services';
import { createMutationErrorHandler } from '../utils/errors';

const PATIENTS_KEY = 'patients';

export function usePatients() {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  // Fetch all patients
  const {
    data: patients = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: [PATIENTS_KEY],
    queryFn: PatientService.getPatients,
  });

  // Create patient mutation
  const createMutation = useMutation({
    mutationFn: (input: CreatePatientInput) => PatientService.createPatient(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] });
      notification.success({
        message: t('patients:messages.createdTitle'),
        description: t('patients:messages.createdDesc', { name: data.name }),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'createPatient', t, 'usePatients'),
  });

  // Update patient mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: UpdatePatientInput }) =>
      PatientService.updatePatient(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] });
      notification.success({
        message: t('patients:messages.updatedTitle'),
        description: t('patients:messages.infoSaved'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'updatePatient', t, 'usePatients'),
  });

  // Delete patient mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => PatientService.deletePatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] });
      notification.success({
        message: t('patients:messages.deletedTitle'),
        description: t('patients:messages.removedDesc'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'deletePatient', t, 'usePatients'),
  });

  // Add owner to patient mutation
  const addOwnerMutation = useMutation({
    mutationFn: ({
      patientId,
      ownerId,
      isPrimary,
      relationshipType,
    }: {
      patientId: number;
      ownerId: number;
      isPrimary?: boolean;
      relationshipType?: 'Owner' | 'Guardian' | 'Emergency Contact';
    }) => PatientService.addPatientOwner(patientId, ownerId, isPrimary, relationshipType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] });
    },
    onError: createMutationErrorHandler(notification, 'addOwner', t, 'usePatients'),
  });

  // Remove owner from patient mutation
  const removeOwnerMutation = useMutation({
    mutationFn: ({ patientId, ownerId }: { patientId: number; ownerId: number }) =>
      PatientService.removePatientOwner(patientId, ownerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] });
    },
    onError: createMutationErrorHandler(notification, 'removeOwner', t, 'usePatients'),
  });

  // Set primary owner mutation
  const setPrimaryOwnerMutation = useMutation({
    mutationFn: ({ patientId, ownerId }: { patientId: number; ownerId: number }) =>
      PatientService.setPrimaryOwner(patientId, ownerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] });
    },
    onError: createMutationErrorHandler(notification, 'setPrimaryOwner', t, 'usePatients'),
  });

  // Get single patient (not cached, for one-off fetches)
  const getPatient = useCallback(async (id: number): Promise<PatientWithOwners> => {
    return PatientService.getPatient(id);
  }, []);

  // Wrapper functions for backwards compatibility
  const createPatient = useCallback(
    async (input: CreatePatientInput): Promise<PatientWithOwners> => {
      return createMutation.mutateAsync(input);
    },
    [createMutation]
  );

  const updatePatient = useCallback(
    async (id: number, updates: UpdatePatientInput) => {
      return updateMutation.mutateAsync({ id, updates });
    },
    [updateMutation]
  );

  const deletePatient = useCallback(
    async (id: number) => {
      return deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const addPatientOwner = useCallback(
    async (
      patientId: number,
      ownerId: number,
      isPrimary?: boolean,
      relationshipType?: 'Owner' | 'Guardian' | 'Emergency Contact'
    ) => {
      return addOwnerMutation.mutateAsync({ patientId, ownerId, isPrimary, relationshipType });
    },
    [addOwnerMutation]
  );

  const removePatientOwner = useCallback(
    async (patientId: number, ownerId: number) => {
      return removeOwnerMutation.mutateAsync({ patientId, ownerId });
    },
    [removeOwnerMutation]
  );

  const setPrimaryOwner = useCallback(
    async (patientId: number, ownerId: number) => {
      return setPrimaryOwnerMutation.mutateAsync({ patientId, ownerId });
    },
    [setPrimaryOwnerMutation]
  );

  const refreshPatients = useCallback(() => {
    return refetch();
  }, [refetch]);

  // Get patients (alias for backwards compatibility)
  const getPatients = useCallback(async () => {
    const result = await refetch();
    return result.data || [];
  }, [refetch]);

  return {
    patients,
    loading,
    error: error ? (error as Error).message : null,
    lastFetch: undefined, // React Query handles caching internally
    getPatients,
    getPatient,
    createPatient,
    updatePatient,
    deletePatient,
    addPatientOwner,
    removePatientOwner,
    setPrimaryOwner,
    refreshPatients,
    // Additional mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Hook for single patient detail with caching
export function usePatientDetail(id: number | undefined) {
  return useQuery({
    queryKey: [PATIENTS_KEY, 'detail', id],
    queryFn: () => (id ? PatientService.getPatient(id) : null),
    enabled: !!id,
  });
}

export default usePatients;
