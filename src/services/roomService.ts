import { ApiService } from './api';
import { Room, RoomFilter, CreateRoomInput, UpdateRoomInput, RoomAvailability } from '../types/rooms';

export class RoomService {
  static async getRooms(filter?: RoomFilter): Promise<Room[]> {
    return ApiService.invoke<Room[]>('get_rooms', { filter });
  }

  static async getRoomById(id: number): Promise<Room> {
    return ApiService.invoke<Room>('get_room', { id });
  }

  static async createRoom(data: CreateRoomInput): Promise<Room> {
    return ApiService.invoke<Room>('create_room', { input: data });
  }

  static async updateRoom(id: number, data: UpdateRoomInput): Promise<Room> {
    return ApiService.invoke<Room>('update_room', { id, input: data });
  }

  static async deleteRoom(id: number): Promise<void> {
    return ApiService.invoke<void>('delete_room', { id });
  }

  static async checkRoomAvailability(
    roomId: number,
    checkTime: string
  ): Promise<RoomAvailability> {
    return ApiService.invoke<RoomAvailability>('get_room_availability', {
      roomId,
      checkTime
    });
  }
}
