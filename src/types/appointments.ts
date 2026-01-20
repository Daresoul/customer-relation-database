export type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Appointment {
  id: number;
  patientId: number;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  roomId?: number;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  createdBy: string;
  // Additional fields for display
  patientName?: string;
  species?: string;
  breed?: string;
  microchipId?: string;
  roomName?: string;
}

export interface AppointmentDetail {
  appointment: Appointment;
  patient?: PatientInfo;
  room?: Room;
}

export interface PatientInfo {
  id: number;
  name: string;
  species?: string;
  breed?: string;
}

export interface Room {
  id: number;
  name: string;
  description?: string;
  capacity: number;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  patientId: number;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  roomId?: number;
}

export interface UpdateAppointmentInput {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  roomId?: number;
  status?: AppointmentStatus;
}

export interface AppointmentFilter {
  startDate?: string;
  endDate?: string;
  patientId?: number;
  roomId?: number;
  status?: AppointmentStatus;
  includeDeleted?: boolean;
  includeCancelled?: boolean;
}

export interface AppointmentListResponse {
  appointments: Appointment[];
  total: number;
  hasMore: boolean;
}

export interface DuplicateAppointmentInput {
  appointmentId: number;
  targetDate: string;
}

export interface ConflictCheckInput {
  startTime: string;
  endTime: string;
  roomId?: number;
  excludeAppointmentId?: number;
}

export interface ConflictCheckResponse {
  hasConflicts: boolean;
  conflicts: Appointment[];
}

export interface CreateRoomInput {
  name: string;
  description?: string;
  capacity?: number;
}

export interface UpdateRoomInput {
  name?: string;
  description?: string;
  capacity?: number;
  isActive?: boolean;
}

export interface RoomFilter {
  activeOnly?: boolean;
}

export interface RoomAvailability {
  room: Room;
  isAvailable: boolean;
  nextAvailable?: string;
  currentAppointments: RoomAppointmentSlot[];
}

export interface RoomAppointmentSlot {
  appointmentId: number;
  patientName: string;
  startTime: string;
  endTime: string;
  status: string;
}

// Calendar view types
export type CalendarView = 'month' | 'week' | 'day';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    appointment: Appointment;
    patientName: string;
    roomName?: string;
  };
}
