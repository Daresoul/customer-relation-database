import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoomInput) => RoomService.createRoom(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      message.success('Room created successfully');
    },
    onError: (error: any) => {
      console.error('Create room error:', error);
      message.error('Failed to create room');
    },
  });
};

export const useUpdateRoom = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRoomInput }) =>
      RoomService.updateRoom(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room'] });
      message.success('Room updated successfully');
    },
    onError: (error: any) => {
      console.error('Update room error:', error);
      message.error('Failed to update room');
    },
  });
};

export const useDeleteRoom = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => RoomService.deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      message.success('Room deleted successfully');
    },
    onError: (error: any) => {
      console.error('Delete room error:', error);
      message.error('Failed to delete room');
    },
  });
};