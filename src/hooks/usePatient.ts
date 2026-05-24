/**
 * React Query hooks for Patient operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { PatientService } from '../services/patientService';
import { Patient, UpdatePatientInput } from '../types';
import { PatientDetail, DeletePatientResponse } from '../types/patient';
import dayjs from 'dayjs';
import { createMutationErrorHandler } from '../utils/errors';

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

          // The Rust Household struct doesn't use serde(rename_all = "camelCase"),
          // so the wire format here is snake_case (household_name, postal_code,
          // is_primary, contact_type, contact_value, etc.). When the call goes
          // through ApiService.invokeRaw (which we now use to avoid the case-
          // transform breaking the request side), no snake→camel conversion
          // happens on the response either. Read both shapes so we work
          // whichever invoke variant is used.
          const h: any = householdData.household ?? {};
          const peopleRaw: any[] = (householdData as any).people ?? [];

          // Find primary contact with all their contact methods.
          const primaryPersonRaw: any = peopleRaw.find((p) => p?.isPrimary ?? p?.is_primary);

          const primaryContact = primaryPersonRaw ? {
            id: primaryPersonRaw.id,
            firstName: primaryPersonRaw.firstName ?? primaryPersonRaw.first_name,
            lastName: primaryPersonRaw.lastName ?? primaryPersonRaw.last_name,
            isPrimary: primaryPersonRaw.isPrimary ?? primaryPersonRaw.is_primary ?? false,
            contacts: (primaryPersonRaw.contacts ?? []).map((c: any) => ({
              id: c.id,
              type: (c.contactType ?? c.contact_type) as 'phone' | 'email' | 'mobile',
              value: c.contactValue ?? c.contact_value ?? '',
              isPrimary: c.isPrimary ?? c.is_primary ?? false,
            })),
          } : undefined;

          // Normalize the rest of the people list (used by "Other Members"
          // tag display) so consumers can rely on camelCase keys.
          const people = peopleRaw.map((p: any) => ({
            id: p.id,
            firstName: p.firstName ?? p.first_name,
            lastName: p.lastName ?? p.last_name,
            isPrimary: p.isPrimary ?? p.is_primary ?? false,
            contacts: p.contacts ?? [],
          }));

          patientDetail.household = {
            id: h.id,
            householdName: h.householdName ?? h.household_name ?? '',
            address: h.address,
            city: h.city,
            postalCode: h.postalCode ?? h.postal_code,
            primaryContact,
            people: people as any,
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
  const { t } = useTranslation('errors');

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
      if (updates.speciesId !== undefined) transformedUpdates.speciesId = updates.speciesId;
      if (updates.breedId !== undefined) transformedUpdates.breedId = updates.breedId;
      if (updates.gender !== undefined) transformedUpdates.gender = updates.gender;
      if (updates.dateOfBirth !== undefined) transformedUpdates.dateOfBirth = updates.dateOfBirth;
      if (updates.weight !== undefined) transformedUpdates.weight = updates.weight;
      if (updates.color !== undefined) transformedUpdates.color = updates.color;
      if (updates.microchipId !== undefined) transformedUpdates.microchipId = updates.microchipId;
      if (updates.notes !== undefined) transformedUpdates.notes = updates.notes;
      if (updates.isActive !== undefined) transformedUpdates.isActive = updates.isActive;

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
      createMutationErrorHandler(notification, 'Update Patient', t, 'usePatient')(error);
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
  const { t } = useTranslation('errors');

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
    onError: createMutationErrorHandler(notification, 'Delete Patient', t, 'usePatient'),
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