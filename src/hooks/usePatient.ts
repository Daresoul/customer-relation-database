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
import { createMutationErrorHandler, extractErrorMessage, type TFunction } from '../utils/errors';
import { invalidatePatientData } from './invalidation';

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string | undefined, t: TFunction) {
  if (!dateOfBirth) return undefined;

  const birthDate = dayjs(dateOfBirth);
  const today = dayjs();

  if (!birthDate.isValid()) return undefined;

  const years = today.diff(birthDate, 'year');
  const months = today.diff(birthDate.add(years, 'year'), 'month');

  const yearsText = t('households:detail.animals.age.years', { count: years });
  const monthsText = t('households:detail.animals.age.months', { count: months });
  let display: string;
  if (years === 0) {
    display = monthsText;
  } else if (months === 0) {
    display = yearsText;
  } else {
    display = `${yearsText} ${monthsText}`;
  }

  return { years, months, display };
}

/**
 * Hook to fetch patient detail with household information
 */
export function usePatientDetail(patientId: number) {
  const { t } = useTranslation();
  return useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      const patient = await PatientService.findPatient(patientId);
      if (!patient) return null;

      // Transform to PatientDetail with calculated age
      const patientDetail: PatientDetail = {
        ...patient,
        age: calculateAge(patient.dateOfBirth, t)
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
          patientDetail.householdLoadFailed = true;
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
            ? calculateAge(updates.dateOfBirth, t)
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
      createMutationErrorHandler(notification, 'updatePatient', t, 'usePatient')(error);
    },
    onSuccess: (updatedPatient, { patientId }) => {
      // Update cache with server response
      queryClient.setQueryData(['patient', patientId], (old: PatientDetail | undefined) => {
        if (!old) return old;
        const updated = {
          ...updatedPatient,
          age: calculateAge(updatedPatient.dateOfBirth, t),
          household: old.household // Preserve household data
        };
        return updated;
      });

      invalidatePatientData(queryClient);

      notification.success({
        message: t('patients:messages.updatedTitle'),
        description: t('patients:messages.updatedDesc'),
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
        message: t('patients:messages.deleteSuccess'),
        redirectTo: '/'
      } as DeletePatientResponse;
    },
    onSuccess: (response, patientId) => {
      // Invalidate and remove from cache
      queryClient.removeQueries({ queryKey: ['patient', patientId] });
      invalidatePatientData(queryClient);

      notification.success({
        message: t('patients:messages.deletedTitle'),
        description: response.message,
        placement: 'bottomRight',
        duration: 3,
      });
      navigate(response.redirectTo);
    },
    onError: (error) => {
      if (extractErrorMessage(error).startsWith('PATIENT_HAS_HISTORY')) {
        notification.error({
          message: t('patients:errors.deleteBlockedTitle'),
          description: t('patients:errors.deleteBlocked'),
          placement: 'bottomRight',
          duration: 8,
        });
        return;
      }
      createMutationErrorHandler(notification, 'deletePatient', t, 'usePatient')(error);
    },
  });
}

/**
 * Hook to show delete confirmation modal
 */
export function useDeleteConfirmation() {
  const { modal } = App.useApp();
  const { t } = useTranslation();
  const deletePatient = useDeletePatient();

  const showDeleteConfirm = (patientId: number, patientName: string) => {
    modal.confirm({
      title: t('patients:deletePatient'),
      content: t('patients:messages.confirmDeleteNamed', { name: patientName }),
      okText: t('common:delete'),
      okType: 'danger',
      cancelText: t('common:cancel'),
      icon: null, // Icon styling is handled by CSS
      centered: true,
      onOk: async () => {
        // onError already explains a refusal; close the dialog either way
        await deletePatient.mutateAsync(patientId).catch(() => {});
      }
    });
  };

  return {
    showDeleteConfirm,
    isDeleting: deletePatient.isPending
  };
}