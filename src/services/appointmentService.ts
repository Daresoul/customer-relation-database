import { ApiService } from './api';
import {
  Appointment,
  AppointmentDetail,
  AppointmentFilter,
  AppointmentListResponse,
  ConflictCheckInput,
  ConflictCheckResponse,
  CreateAppointmentInput,
  CreateRoomInput,
  DuplicateAppointmentInput,
  Room,
  RoomAvailability,
  RoomFilter,
  UpdateAppointmentInput,
  UpdateRoomInput,
} from '../types/appointments';

export class AppointmentService {
  // Appointment operations
  static async getAppointments(
    filter: AppointmentFilter,
    limit: number = 20,
    offset: number = 0
  ): Promise<AppointmentListResponse> {
    return ApiService.invoke('get_appointments', { filter, limit, offset });
  }

  static async getAppointment(id: number): Promise<AppointmentDetail> {
    return ApiService.invoke('get_appointment', { id });
  }

  static async createAppointment(
    input: CreateAppointmentInput,
    createdBy?: string
  ): Promise<Appointment> {
    return ApiService.invoke('create_appointment', { input, createdBy });
  }

  static async updateAppointment(
    id: number,
    input: UpdateAppointmentInput,
    updatedBy?: string
  ): Promise<Appointment> {
    return ApiService.invoke('update_appointment', { id, input, updatedBy });
  }

  static async deleteAppointment(id: number): Promise<void> {
    return ApiService.invoke('delete_appointment', { id });
  }

  static async checkConflicts(input: ConflictCheckInput): Promise<ConflictCheckResponse> {
    return ApiService.invoke('check_conflicts', { input });
  }

  static async duplicateAppointment(
    input: DuplicateAppointmentInput,
    createdBy?: string
  ): Promise<Appointment> {
    return ApiService.invoke('duplicate_appointment', { input, createdBy });
  }

  // Room operations
  static async getRooms(filter?: RoomFilter): Promise<Room[]> {
    return ApiService.invoke('get_rooms', { filter });
  }

  static async getRoom(id: number): Promise<Room> {
    return ApiService.invoke('get_room', { id });
  }

  static async createRoom(input: CreateRoomInput): Promise<Room> {
    return ApiService.invoke('create_room', { input });
  }

  static async updateRoom(id: number, input: UpdateRoomInput): Promise<Room> {
    return ApiService.invoke('update_room', { id, input });
  }

  static async deleteRoom(id: number): Promise<void> {
    return ApiService.invoke('delete_room', { id });
  }

  static async getRoomAvailability(
    roomId: number,
    checkTime: string
  ): Promise<RoomAvailability> {
    return ApiService.invoke('get_room_availability', { roomId, checkTime });
  }

  // Helper methods
  static formatTimeSlot(date: Date): string {
    // Round to nearest 15 minutes
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    date.setMinutes(roundedMinutes);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date.toISOString();
  }

  static validateTimeSlot(date: Date): boolean {
    const minutes = date.getMinutes();
    return minutes % 15 === 0;
  }

  static calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (end.getTime() - start.getTime()) / (1000 * 60); // Duration in minutes
  }

  static generateTimeSlots(
    startHour: number = 8,
    endHour: number = 18,
    intervalMinutes: number = 15
  ): string[] {
    const slots: string[] = [];
    const date = new Date();
    date.setHours(startHour, 0, 0, 0);
    const endTime = new Date();
    endTime.setHours(endHour, 0, 0, 0);

    while (date < endTime) {
      slots.push(
        date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
      date.setMinutes(date.getMinutes() + intervalMinutes);
    }

    return slots;
  }

  static getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      scheduled: '#1890ff',
      in_progress: '#faad14',
      completed: '#52c41a',
      cancelled: '#ff4d4f',
    };
    return colors[status] || '#d9d9d9';
  }

  static isAppointmentEditable(appointment: Appointment): boolean {
    return (
      appointment.status === 'scheduled' &&
      !appointment.deletedAt &&
      new Date(appointment.startTime) > new Date()
    );
  }
}

// Default export for backwards compatibility with hooks using instance methods
const appointmentServiceInstance = {
  getAppointments: AppointmentService.getAppointments,
  getAppointment: AppointmentService.getAppointment,
  createAppointment: AppointmentService.createAppointment,
  updateAppointment: AppointmentService.updateAppointment,
  deleteAppointment: AppointmentService.deleteAppointment,
  checkConflicts: AppointmentService.checkConflicts,
  duplicateAppointment: AppointmentService.duplicateAppointment,
  getRooms: AppointmentService.getRooms,
  getRoom: AppointmentService.getRoom,
  createRoom: AppointmentService.createRoom,
  updateRoom: AppointmentService.updateRoom,
  deleteRoom: AppointmentService.deleteRoom,
  getRoomAvailability: AppointmentService.getRoomAvailability,
  formatTimeSlot: AppointmentService.formatTimeSlot,
  validateTimeSlot: AppointmentService.validateTimeSlot,
  calculateDuration: AppointmentService.calculateDuration,
  generateTimeSlots: AppointmentService.generateTimeSlots,
  getStatusColor: AppointmentService.getStatusColor,
  isAppointmentEditable: AppointmentService.isAppointmentEditable,
};

export const appointmentService = appointmentServiceInstance;
export default appointmentServiceInstance;
