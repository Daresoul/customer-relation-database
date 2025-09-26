import { invoke } from '@tauri-apps/api/tauri';
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

class AppointmentService {
  // Appointment operations
  async getAppointments(
    filter: AppointmentFilter,
    limit: number = 20,
    offset: number = 0
  ): Promise<AppointmentListResponse> {
    return invoke('get_appointments', { filter, limit, offset });
  }

  async getAppointment(id: number): Promise<AppointmentDetail> {
    return invoke('get_appointment', { id });
  }

  async createAppointment(
    input: CreateAppointmentInput,
    createdBy?: string
  ): Promise<Appointment> {
    return invoke('create_appointment', { input, createdBy });
  }

  async updateAppointment(
    id: number,
    input: UpdateAppointmentInput,
    updatedBy?: string
  ): Promise<Appointment> {
    return invoke('update_appointment', { id, input, updatedBy });
  }

  async deleteAppointment(id: number): Promise<void> {
    return invoke('delete_appointment', { id });
  }

  async checkConflicts(input: ConflictCheckInput): Promise<ConflictCheckResponse> {
    return invoke('check_conflicts', { input });
  }

  async duplicateAppointment(
    input: DuplicateAppointmentInput,
    createdBy?: string
  ): Promise<Appointment> {
    return invoke('duplicate_appointment', { input, createdBy });
  }

  // Room operations
  async getRooms(filter?: RoomFilter): Promise<Room[]> {
    return invoke('get_rooms', { filter });
  }

  async getRoom(id: number): Promise<Room> {
    return invoke('get_room', { id });
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    return invoke('create_room', { input });
  }

  async updateRoom(id: number, input: UpdateRoomInput): Promise<Room> {
    return invoke('update_room', { id, input });
  }

  async deleteRoom(id: number): Promise<void> {
    return invoke('delete_room', { id });
  }

  async getRoomAvailability(
    roomId: number,
    checkTime: string
  ): Promise<RoomAvailability> {
    return invoke('get_room_availability', { roomId, checkTime });
  }

  // Helper methods
  formatTimeSlot(date: Date): string {
    // Round to nearest 15 minutes
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    date.setMinutes(roundedMinutes);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date.toISOString();
  }

  validateTimeSlot(date: Date): boolean {
    const minutes = date.getMinutes();
    return minutes % 15 === 0;
  }

  calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (end.getTime() - start.getTime()) / (1000 * 60); // Duration in minutes
  }

  generateTimeSlots(
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

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      scheduled: '#1890ff',
      in_progress: '#faad14',
      completed: '#52c41a',
      cancelled: '#ff4d4f',
    };
    return colors[status] || '#d9d9d9';
  }

  isAppointmentEditable(appointment: Appointment): boolean {
    return (
      appointment.status === 'scheduled' &&
      !appointment.deleted_at &&
      new Date(appointment.start_time) > new Date()
    );
  }
}

export const appointmentService = new AppointmentService();

export default new AppointmentService();