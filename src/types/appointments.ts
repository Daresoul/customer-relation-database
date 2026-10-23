/**
 * scheduled → checked_in (arrival time) → in_progress (in consult) → completed
 * (done); cancelled and no_show close a visit without it happening.
 */
export type AppointmentStatus =
  | 'scheduled'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

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
  /** Arrival time, set by check-in. */
  checkedInAt?: string | null;
  /** The record started from this appointment. */
  medicalRecordId?: number | null;
}

export type GoogleSyncState = 'off' | 'synced' | 'not_synced' | 'reconnect';

/** `get_appointment`: the appointment's own fields, plus patient, room and Google state. */
export interface AppointmentDetail extends Appointment {
  patient?: PatientInfo;
  room?: Room;
  googleSyncState: GoogleSyncState;
  googleSyncedAt?: string | null;
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
  patientId?: number;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  /** Left out: keep the room. null: no room. */
  roomId?: number | null;
  status?: AppointmentStatus;
  medicalRecordId?: number;
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
  /** Also list this patient's other appointments at that time. */
  patientId?: number;
}

export interface ConflictCheckResponse {
  hasConflicts: boolean;
  conflicts: Appointment[];
  patientConflicts?: Appointment[];
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
