/**
 * React Query hooks for Patient operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { PatientService } from '../services/patientService';
import { Patient, UpdatePatientInput } from '../types';
import { PatientDetail, DeletePatientResponse } from '../types/patient';
import dayjs from 'dayjs';

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth?: string) {
  if (!dateOfBirth) return undefined;

  const birthDate = dayjs(dateOfBirth);
  const today = dayjs();

  if (!birthDate.isValid()) return undefined;

  const years = today.diff(birthDate, 'year');
  const months = today.diff(birthDate.add(years, 'year'), 'month');

  let display: string;
  if (years === 0) {
    display = months === 1 ? '1 month' : `${months} months`;
  } else if (months === 0) {
    display = years === 1 ? '1 year' : `${years} years`;
  } else {
    display = `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
  }

  return { years, months, display };
}

/**
 * Hook to fetch patient detail with household information
 */
export function usePatientDetail(patientId: number) {
  return useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      const patient = await PatientService.getPatient(patientId);

      // Transform to PatientDetail with calculated age
      const patientDetail: PatientDetail = {
        ...patient,
        age: calculateAge(patient.dateOfBirth)
      };

      // If patient has a household, fetch household details
      if (patient.householdId) {
        try {
          // Import dynamically to avoid circular dependencies
          const { getHouseholdWithPeople } = await import('../services/householdService');
          const householdData = await getHouseholdWithPeople(patient.householdId);

          if (!householdData) {
            console.warn('No household data found for id:', patient.householdId);
            return patientDetail;
          }

          const household = {
            ...householdData.household,
            people: householdData.people
          };

          // Find primary contact with all their contact methods
          const primaryPerson = household.people?.find(p => p.isPrimary);

          const primaryContact = primaryPerson ? {
            ...primaryPerson,
            contacts: primaryPerson.contacts?.map((c: any) => ({
              id: c.id,
              type: c.contactType as 'phone' | 'email' | 'mobile',  // camelCase from service
              value: c.contactValue || '',  // camelCase from service
              isPrimary: c.isPrimary || false  // already camelCase
            })) || []
          } : undefined;

          patientDetail.household = {
            id: household.id,
            householdName: household.householdName,
            address: household.address,
            city: household.city,
            postalCode: household.postalCode,
            primaryContact,
            people: household.people
          };
        } catch (error) {
          console.error('Failed to fetch household details:', error);
          // Continue without household data
        }
      }

      return patientDetail;
    },
    enabled: !!patientId && patientId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to update patient information with optimistic updates
 */
export function useUpdatePatient() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: async ({
      patientId,
      updates
    }: {
      patientId: number;
      updates: UpdatePatientInput
    }) => {
      // Transform the updates to match the backend format
      const transformedUpdates: UpdatePatientInput = {};

      // Map fields correctly - only include fields that are being updated
      if (updates.name !== undefined) transformedUpdates.name = updates.name;
      if (updates.species !== undefined) transformedUpdates.species = updates.species;
      if (updates.breed !== undefined) transformedUpdates.breed = updates.breed;
      if (updates.gender !== undefined) transformedUpdates.gender = updates.gender;
      if (updates.dateOfBirth !== undefined) transformedUpdates.dateOfBirth = updates.dateOfBirth;
      if (updates.weight !== undefined) transformedUpdates.weight = updates.weight;
      if (updates.color !== undefined) transformedUpdates.color = updates.color;
      if (updates.microchipId !== undefined) transformedUpdates.microchipId = updates.microchipId;
      if (updates.notes !== undefined) transformedUpdates.notes = updates.notes;
      if (updates.householdId !== undefined) transformedUpdates.householdId = updates.householdId;

      return PatientService.updatePatient(patientId, transformedUpdates);
    },
    onMutate: async ({ patientId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['patient', patientId] });

      // Snapshot the previous value
      const previousPatient = queryClient.getQueryData<PatientDetail>(['patient', patientId]);

      // Optimistically update
      if (previousPatient) {
        const optimisticPatient: PatientDetail = {
          ...previousPatient,
          ...updates,
          age: updates.dateOfBirth
            ? calculateAge(updates.dateOfBirth)
            : previousPatient.age
        };
        queryClient.setQueryData(['patient', patientId], optimisticPatient);
      }

      return { previousPatient };
    },
    onError: (error, { patientId }, context) => {
      // Rollback on error
      if (context?.previousPatient) {
        queryClient.setQueryData(['patient', patientId], context.previousPatient);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Update Patient',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Update patient error:', error);
    },
    onSuccess: (updatedPatient, { patientId }) => {
      // Update cache with server response
      queryClient.setQueryData(['patient', patientId], (old: PatientDetail | undefined) => {
        if (!old) return old;
        const updated = {
          ...updatedPatient,
          age: calculateAge(updatedPatient.dateOfBirth),
          household: old.household // Preserve household data
        };
        return updated;
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      if (updatedPatient.householdId) {
        queryClient.invalidateQueries({
          queryKey: ['household', updatedPatient.householdId, 'patients']
        });
      }

      notification.success({
        message: 'Patient Updated',
        description: 'Patient information saved successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    }
  });
}

/**
 * Hook to delete a patient with confirmation
 */
export function useDeletePatient() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: async (patientId: number) => {
      await PatientService.deletePatient(patientId);
      return {
        success: true,
        message: 'Patient deleted successfully',
        redirectTo: '/'
      } as DeletePatientResponse;
    },
    onSuccess: (response, patientId) => {
      // Invalidate and remove from cache
      queryClient.removeQueries({ queryKey: ['patient', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });

      notification.success({
        message: 'Patient Deleted',
        description: response.message,
        placement: 'bottomRight',
        duration: 3,
      });
      navigate(response.redirectTo);
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Delete Patient',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Delete patient error:', error);
    }
  });
}

/**
 * Hook to show delete confirmation modal
 */
export function useDeleteConfirmation() {
  const { modal } = App.useApp();
  const deletePatient = useDeletePatient();

  const showDeleteConfirm = (patientId: number, patientName: string) => {
    modal.confirm({
      title: 'Delete Patient',
      content: `Are you sure you want to delete ${patientName}? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      icon: null, // Icon styling is handled by CSS
      centered: true,
      onOk: async () => {
        await deletePatient.mutateAsync(patientId);
      }
    });
  };

  return {
    showDeleteConfirm,
    isDeleting: deletePatient.isPending
  };
}