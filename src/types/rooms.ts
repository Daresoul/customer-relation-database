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

export interface RoomFilter {
  active_only: boolean;
}

export interface CreateRoomInput {
  name: string;
  description?: string;
  capacity?: number;
  color?: string;
}

export interface UpdateRoomInput {
  name?: string;
  description?: string;
  capacity?: number;
  color?: string;
  is_active?: boolean;
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