export type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Appointment {
  id: number;
  patient_id: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  room_id?: number;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  created_by: string;
  // Additional fields for display
  patient_name?: string;
  species?: string;
  breed?: string;
  microchip_id?: string;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAppointmentInput {
  patient_id: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  room_id?: number;
}

export interface UpdateAppointmentInput {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  room_id?: number;
  status?: AppointmentStatus;
}

export interface AppointmentFilter {
  start_date?: string;
  end_date?: string;
  patient_id?: number;
  room_id?: number;
  status?: AppointmentStatus;
  include_deleted?: boolean;
  include_cancelled?: boolean;
}

export interface AppointmentListResponse {
  appointments: Appointment[];
  total: number;
  has_more: boolean;
}

export interface DuplicateAppointmentInput {
  appointment_id: number;
  target_date: string;
}

export interface ConflictCheckInput {
  start_time: string;
  end_time: string;
  room_id?: number;
  exclude_appointment_id?: number;
}

export interface ConflictCheckResponse {
  has_conflicts: boolean;
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
  is_active?: boolean;
}

export interface RoomFilter {
  active_only?: boolean;
}

export interface RoomAvailability {
  room: Room;
  is_available: boolean;
  next_available?: string;
  current_appointments: RoomAppointmentSlot[];
}

export interface RoomAppointmentSlot {
  appointment_id: number;
  patient_name: string;
  start_time: string;
  end_time: string;
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