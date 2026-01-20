import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import appointmentService from '../services/appointmentService';
import { createMutationErrorHandler } from '../utils/errors';
import {
  Appointment,
  AppointmentFilter,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  ConflictCheckInput,
  DuplicateAppointmentInput,
  Room,
  RoomFilter,
} from '../types/appointments';

const APPOINTMENTS_KEY = 'appointments';
const ROOMS_KEY = 'rooms';
const PAGE_SIZE = 20;

export const useAppointments = (filter: AppointmentFilter = {}) => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();
  const [currentFilter, setCurrentFilter] = useState<AppointmentFilter>(filter);

  // Sync external filter changes
  useEffect(() => {
    setCurrentFilter(filter);
  }, [filter]);

  // Fetch appointments with pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: [APPOINTMENTS_KEY, currentFilter],
    queryFn: ({ pageParam = 0 }) => {
      return appointmentService.getAppointments(currentFilter, PAGE_SIZE, pageParam);
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.length * PAGE_SIZE;
      return lastPage.hasMore ? totalFetched : undefined;
    },
    initialPageParam: 0,
    staleTime: 0, // Force immediate refetch
    gcTime: 0, // Don't cache
  });

  // Flatten appointments from all pages
  const appointments = useMemo(
    () => data?.pages.flatMap((page) => page.appointments) ?? [],
    [data]
  );

  const totalCount = data?.pages[0]?.total ?? 0;

  // Create appointment mutation
  const createMutation = useMutation({
    mutationFn: (input: CreateAppointmentInput) =>
      appointmentService.createAppointment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
      notification.success({
        message: 'Appointment Created',
        description: 'Appointment scheduled successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Create Appointment', t, 'useAppointments'),
  });

  // Update appointment mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAppointmentInput }) =>
      appointmentService.updateAppointment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
      notification.success({
        message: 'Appointment Updated',
        description: 'Appointment updated successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Update Appointment', t, 'useAppointments'),
  });

  // Delete appointment mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => appointmentService.deleteAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
      notification.success({
        message: 'Appointment Cancelled',
        description: 'Appointment has been cancelled',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Cancel Appointment', t, 'useAppointments'),
  });

  // Duplicate appointment mutation
  const duplicateMutation = useMutation({
    mutationFn: (input: DuplicateAppointmentInput) =>
      appointmentService.duplicateAppointment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
      notification.success({
        message: 'Appointment Duplicated',
        description: 'Appointment has been duplicated',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Duplicate Appointment', t, 'useAppointments'),
  });

  // Check conflicts
  const checkConflicts = useCallback(
    async (input: ConflictCheckInput) => {
      return appointmentService.checkConflicts(input);
    },
    []
  );

  // Update filter and refetch
  const updateFilter = useCallback(
    (newFilter: AppointmentFilter) => {
      setCurrentFilter(newFilter);
    },
    []
  );

  return {
    appointments,
    totalCount,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    createAppointment: createMutation.mutate,
    updateAppointment: updateMutation.mutate,
    deleteAppointment: deleteMutation.mutate,
    duplicateAppointment: duplicateMutation.mutate,
    checkConflicts,
    updateFilter,
    filter: currentFilter,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
  };
};

// Hook for single appointment detail
export const useAppointmentDetail = (id: number | undefined) => {
  return useQuery({
    queryKey: [APPOINTMENTS_KEY, 'detail', id],
    queryFn: () => (id ? appointmentService.getAppointment(id) : null),
    enabled: !!id,
  });
};

// Hook for calendar view appointments
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
