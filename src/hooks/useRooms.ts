import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { RoomService } from '../services/roomService';
import { Room, RoomFilter, CreateRoomInput, UpdateRoomInput } from '../types/rooms';

export const useRooms = (filter: RoomFilter = { active_only: true }) => {
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
    onError: (error: any) => {
      console.error('Create room error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Create Room',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};

export const useUpdateRoom = () => {
  const { notification } = App.useApp();
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
    onError: (error: any) => {
      console.error('Update room error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Update Room',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};

export const useDeleteRoom = () => {
  const { notification } = App.useApp();
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
    onError: (error: any) => {
      console.error('Delete room error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Delete Room',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};