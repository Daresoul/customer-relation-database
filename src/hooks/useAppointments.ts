import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import appointmentService from '../services/appointmentService';
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
  const queryClient = useQueryClient();
  const [currentFilter, setCurrentFilter] = useState<AppointmentFilter>(filter);

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
    queryFn: ({ pageParam = 0 }) =>
      appointmentService.getAppointments(currentFilter, PAGE_SIZE, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.length * PAGE_SIZE;
      return lastPage.has_more ? totalFetched : undefined;
    },
    initialPageParam: 0,
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
    },
  });

  // Update appointment mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAppointmentInput }) =>
      appointmentService.updateAppointment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
    },
  });

  // Delete appointment mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => appointmentService.deleteAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
    },
  });

  // Duplicate appointment mutation
  const duplicateMutation = useMutation({
    mutationFn: (input: DuplicateAppointmentInput) =>
      appointmentService.duplicateAppointment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
    },
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

// Hook for rooms
export const useRooms = (filter?: RoomFilter) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [ROOMS_KEY, filter],
    queryFn: () => appointmentService.getRooms(filter),
  });

  const createMutation = useMutation({
    mutationFn: appointmentService.createRoom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOMS_KEY] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: any }) =>
      appointmentService.updateRoom(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOMS_KEY] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: appointmentService.deleteRoom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOMS_KEY] });
    },
  });

  return {
    rooms: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createRoom: createMutation.mutate,
    updateRoom: updateMutation.mutate,
    deleteRoom: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};

// Hook for room availability
export const useRoomAvailability = (roomId: number | undefined, checkTime: string) => {
  return useQuery({
    queryKey: [ROOMS_KEY, 'availability', roomId, checkTime],
    queryFn: () =>
      roomId ? appointmentService.getRoomAvailability(roomId, checkTime) : null,
    enabled: !!roomId && !!checkTime,
  });
};

// Hook for calendar view appointments
export const useCalendarAppointments = (startDate: Date, endDate: Date) => {
  const filter: AppointmentFilter = {
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    include_deleted: false,
  };

  return useQuery({
    queryKey: [APPOINTMENTS_KEY, 'calendar', filter],
    queryFn: () => appointmentService.getAppointments(filter, 1000, 0),
  });
};