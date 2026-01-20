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

export interface RoomFilter {
  activeOnly: boolean;
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
  isActive?: boolean;
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