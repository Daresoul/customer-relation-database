import { invoke } from '@tauri-apps/api';
import { Room, RoomFilter, CreateRoomInput, UpdateRoomInput, RoomAvailability } from '../types/rooms';

export class RoomService {
  static async getRooms(filter?: RoomFilter): Promise<Room[]> {
    try {
      return await invoke<Room[]>('get_rooms', { filter });
    } catch (error) {
      console.error('Failed to get rooms:', error);
      throw error;
    }
  }

  static async getRoomById(id: number): Promise<Room> {
    try {
      return await invoke<Room>('get_room', { id });
    } catch (error) {
      console.error('Failed to get room:', error);
      throw error;
    }
  }

  static async createRoom(data: CreateRoomInput): Promise<Room> {
    try {
      return await invoke<Room>('create_room', { input: data });
    } catch (error) {
      console.error('Failed to create room:', error);
      throw error;
    }
  }

  static async updateRoom(id: number, data: UpdateRoomInput): Promise<Room> {
    try {
      return await invoke<Room>('update_room', { id, input: data });
    } catch (error) {
      console.error('Failed to update room:', error);
      throw error;
    }
  }

  static async deleteRoom(id: number): Promise<void> {
    try {
      await invoke<void>('delete_room', { id });
    } catch (error) {
      console.error('Failed to delete room:', error);
      throw error;
    }
  }

  static async checkRoomAvailability(
    roomId: number,
    checkTime: string
  ): Promise<RoomAvailability> {
    try {
      return await invoke<RoomAvailability>('get_room_availability', {
        room_id: roomId,
        check_time: checkTime
      });
    } catch (error) {
      console.error('Failed to check room availability:', error);
      throw error;
    }
  }
}