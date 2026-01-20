import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { RoomService } from '../services/roomService';
import { Room, RoomFilter, CreateRoomInput, UpdateRoomInput } from '../types/rooms';
import { createMutationErrorHandler } from '../utils/errors';

export const useRooms = (filter: RoomFilter = { activeOnly: true }) => {
  return useQuery({
    queryKey: ['rooms', filter],
    queryFn: () => RoomService.getRooms(filter),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useRoom = (id: number) => {
  return useQuery({
    queryKey: ['room', id],
    queryFn: () => RoomService.getRoomById(id),
    enabled: !!id,
  });
};

export const useCreateRoom = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoomInput) => RoomService.createRoom(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      notification.success({
        message: 'Room Created',
        description: 'Room created successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Create Room', t, 'useRooms'),
  });
};

export const useUpdateRoom = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRoomInput }) =>
      RoomService.updateRoom(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room'] });
      notification.success({
        message: 'Room Updated',
        description: 'Room updated successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Update Room', t, 'useRooms'),
  });
};

export const useDeleteRoom = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => RoomService.deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      notification.success({
        message: 'Room Deleted',
        description: 'Room deleted successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Delete Room', t, 'useRooms'),
  });
};
