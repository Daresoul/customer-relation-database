import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import appointmentService from '../services/appointmentService';
import { createMutationErrorHandler } from '../utils/errors';
import { invalidateAppointmentData } from './invalidation';
import {
  AppointmentFilter,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  ConflictCheckInput,
  DuplicateAppointmentInput,
} from '../types/appointments';

const APPOINTMENTS_KEY = 'appointments';

/**
 * Appointment writes. Each resolves only after the backend confirms and
 * rejects on failure (the error notification is shown here), so callers show
 * their own success message and keep forms open on failure. The calendar and
 * lists read through `useCalendarAppointments`.
 */
export const useAppointments = (_filter: AppointmentFilter = {}) => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();
  const onSuccess = () => invalidateAppointmentData(queryClient);

  const createMutation = useMutation({
    mutationFn: (input: CreateAppointmentInput) => appointmentService.createAppointment(input),
    onSuccess,
    onError: createMutationErrorHandler(notification, 'createAppointment', t, 'useAppointments'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAppointmentInput }) =>
      appointmentService.updateAppointment(id, input),
    onSuccess,
    onError: createMutationErrorHandler(notification, 'updateAppointment', t, 'useAppointments'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => appointmentService.deleteAppointment(id),
    onSuccess,
    onError: createMutationErrorHandler(notification, 'cancelAppointment', t, 'useAppointments'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (input: DuplicateAppointmentInput) => appointmentService.duplicateAppointment(input),
    onSuccess,
    onError: createMutationErrorHandler(notification, 'duplicateAppointment', t, 'useAppointments'),
  });

  const checkConflicts = useCallback(
    async (input: ConflictCheckInput) => appointmentService.checkConflicts(input),
    [],
  );

  return {
    createAppointment: createMutation.mutateAsync,
    updateAppointment: updateMutation.mutateAsync,
    deleteAppointment: deleteMutation.mutateAsync,
    duplicateAppointment: duplicateMutation.mutateAsync,
    checkConflicts,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
  };
};

/** One appointment with patient, room and Google state (the appointment panel). */
export const useAppointmentDetail = (id: number | undefined | null) => {
  return useQuery({
    queryKey: [APPOINTMENTS_KEY, 'detail', id],
    queryFn: () => appointmentService.getAppointment(id as number),
    enabled: !!id,
  });
};

/** Appointments starting in [startDate, endDate]: the range a view shows. */
export const useCalendarAppointments = (startDate: Date, endDate: Date, additionalFilter?: Partial<AppointmentFilter>) => {
  const filter: AppointmentFilter = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    includeDeleted: false,
    ...additionalFilter,
  };

  return useQuery({
    queryKey: [APPOINTMENTS_KEY, 'calendar', filter],
    queryFn: () => appointmentService.getAppointments(filter, 1000, 0),
  });
};
