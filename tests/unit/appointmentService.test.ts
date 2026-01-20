/**
 * Unit Tests for AppointmentService
 * Tests for helper methods and static functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppointmentService } from '../../src/services/appointmentService';
import type { Appointment } from '../../src/types/appointments';

// Mock the ApiService
vi.mock('../../src/services/api', () => ({
  ApiService: {
    invoke: vi.fn(),
  },
}));

import { ApiService } from '../../src/services/api';

describe('AppointmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Time Slot Helpers
  // ============================================================================

  describe('formatTimeSlot', () => {
    // Note: formatTimeSlot uses Math.round, so:
    // 0-7 minutes -> 0, 8-22 -> 15, 23-37 -> 30, 38-52 -> 45, 53-59 -> 60(00 next hour)

    it('rounds :07 down to :00 (nearest 15-min interval)', () => {
      const date = new Date('2024-06-15T10:07:00Z');
      const result = AppointmentService.formatTimeSlot(date);

      // 7/15 = 0.47, rounds to 0 -> :00
      expect(result).toContain('T10:00:00');
    });

    it('rounds :08 up to :15 (nearest 15-min interval)', () => {
      const date = new Date('2024-06-15T10:08:00Z');
      const result = AppointmentService.formatTimeSlot(date);

      // 8/15 = 0.53, rounds to 1 -> :15
      expect(result).toContain('T10:15:00');
    });

    it('keeps exact 15-minute intervals unchanged', () => {
      const date = new Date('2024-06-15T10:00:00Z');
      const result = AppointmentService.formatTimeSlot(date);
      expect(result).toContain('T10:00:00');
    });

    it('rounds :30 unchanged', () => {
      const date = new Date('2024-06-15T14:30:00Z');
      const result = AppointmentService.formatTimeSlot(date);
      expect(result).toContain('T14:30:00');
    });

    it('rounds :45 unchanged', () => {
      const date = new Date('2024-06-15T09:45:00Z');
      const result = AppointmentService.formatTimeSlot(date);
      expect(result).toContain('T09:45:00');
    });

    it('zeros out seconds and milliseconds', () => {
      const date = new Date('2024-06-15T10:15:45.123Z');
      const result = AppointmentService.formatTimeSlot(date);
      expect(result).toContain('T10:15:00');
    });

    it('rounds :07 at midnight down to :00', () => {
      const date = new Date('2024-06-15T00:07:00Z');
      const result = AppointmentService.formatTimeSlot(date);
      // 7/15 rounds down to 0
      expect(result).toContain('T00:00:00');
    });

    it('handles end of day', () => {
      const date = new Date('2024-06-15T23:52:00Z');
      const result = AppointmentService.formatTimeSlot(date);
      // 52/15 = 3.47, rounds to 3 -> :45
      expect(result).toContain('T23:45:00');
    });
  });

  describe('validateTimeSlot', () => {
    it('returns true for :00 minutes', () => {
      const date = new Date('2024-06-15T10:00:00Z');
      expect(AppointmentService.validateTimeSlot(date)).toBe(true);
    });

    it('returns true for :15 minutes', () => {
      const date = new Date('2024-06-15T10:15:00Z');
      expect(AppointmentService.validateTimeSlot(date)).toBe(true);
    });

    it('returns true for :30 minutes', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      expect(AppointmentService.validateTimeSlot(date)).toBe(true);
    });

    it('returns true for :45 minutes', () => {
      const date = new Date('2024-06-15T10:45:00Z');
      expect(AppointmentService.validateTimeSlot(date)).toBe(true);
    });

    it('returns false for :07 minutes', () => {
      const date = new Date('2024-06-15T10:07:00Z');
      expect(AppointmentService.validateTimeSlot(date)).toBe(false);
    });

    it('returns false for :22 minutes', () => {
      const date = new Date('2024-06-15T10:22:00Z');
      expect(AppointmentService.validateTimeSlot(date)).toBe(false);
    });

    it('returns false for :59 minutes', () => {
      const date = new Date('2024-06-15T10:59:00Z');
      expect(AppointmentService.validateTimeSlot(date)).toBe(false);
    });
  });

  describe('calculateDuration', () => {
    it('calculates 30 minutes correctly', () => {
      const start = '2024-06-15T10:00:00Z';
      const end = '2024-06-15T10:30:00Z';
      expect(AppointmentService.calculateDuration(start, end)).toBe(30);
    });

    it('calculates 1 hour correctly', () => {
      const start = '2024-06-15T10:00:00Z';
      const end = '2024-06-15T11:00:00Z';
      expect(AppointmentService.calculateDuration(start, end)).toBe(60);
    });

    it('calculates 15 minutes correctly', () => {
      const start = '2024-06-15T14:00:00Z';
      const end = '2024-06-15T14:15:00Z';
      expect(AppointmentService.calculateDuration(start, end)).toBe(15);
    });

    it('calculates multi-hour duration', () => {
      const start = '2024-06-15T09:00:00Z';
      const end = '2024-06-15T12:30:00Z';
      expect(AppointmentService.calculateDuration(start, end)).toBe(210); // 3.5 hours
    });

    it('returns negative for reversed times', () => {
      const start = '2024-06-15T11:00:00Z';
      const end = '2024-06-15T10:00:00Z';
      expect(AppointmentService.calculateDuration(start, end)).toBe(-60);
    });

    it('returns 0 for same times', () => {
      const start = '2024-06-15T10:00:00Z';
      const end = '2024-06-15T10:00:00Z';
      expect(AppointmentService.calculateDuration(start, end)).toBe(0);
    });
  });

  describe('generateTimeSlots', () => {
    it('generates slots with default parameters', () => {
      const slots = AppointmentService.generateTimeSlots();

      // Default: 8:00 to 18:00, 15-min intervals = 40 slots
      expect(slots.length).toBe(40);
      expect(slots[0]).toBe('08:00');
      expect(slots[slots.length - 1]).toBe('17:45');
    });

    it('generates slots with custom start and end hours', () => {
      const slots = AppointmentService.generateTimeSlots(9, 17);

      // 9:00 to 17:00 = 32 slots
      expect(slots.length).toBe(32);
      expect(slots[0]).toBe('09:00');
      expect(slots[slots.length - 1]).toBe('16:45');
    });

    it('generates slots with custom interval', () => {
      const slots = AppointmentService.generateTimeSlots(8, 10, 30);

      // 8:00 to 10:00, 30-min intervals = 4 slots
      expect(slots.length).toBe(4);
      expect(slots).toEqual(['08:00', '08:30', '09:00', '09:30']);
    });

    it('generates single hour of slots', () => {
      const slots = AppointmentService.generateTimeSlots(12, 13);

      // 12:00 to 13:00 = 4 slots
      expect(slots.length).toBe(4);
      expect(slots).toEqual(['12:00', '12:15', '12:30', '12:45']);
    });

    it('returns empty for same start and end', () => {
      const slots = AppointmentService.generateTimeSlots(10, 10);
      expect(slots.length).toBe(0);
    });
  });

  describe('getStatusColor', () => {
    it('returns blue for scheduled', () => {
      expect(AppointmentService.getStatusColor('scheduled')).toBe('#1890ff');
    });

    it('returns orange/gold for in_progress', () => {
      expect(AppointmentService.getStatusColor('in_progress')).toBe('#faad14');
    });

    it('returns green for completed', () => {
      expect(AppointmentService.getStatusColor('completed')).toBe('#52c41a');
    });

    it('returns red for cancelled', () => {
      expect(AppointmentService.getStatusColor('cancelled')).toBe('#ff4d4f');
    });

    it('returns gray for unknown status', () => {
      expect(AppointmentService.getStatusColor('unknown')).toBe('#d9d9d9');
      expect(AppointmentService.getStatusColor('')).toBe('#d9d9d9');
    });
  });

  describe('isAppointmentEditable', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday

    const createAppointment = (overrides: Partial<Appointment> = {}): Appointment => ({
      id: 1,
      patientId: 1,
      title: 'Test',
      startTime: futureDate,
      endTime: futureDate,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'admin',
      ...overrides,
    });

    it('returns true for scheduled future appointment', () => {
      const appointment = createAppointment();
      expect(AppointmentService.isAppointmentEditable(appointment)).toBe(true);
    });

    it('returns false for cancelled appointment', () => {
      const appointment = createAppointment({ status: 'cancelled' });
      expect(AppointmentService.isAppointmentEditable(appointment)).toBe(false);
    });

    it('returns false for completed appointment', () => {
      const appointment = createAppointment({ status: 'completed' });
      expect(AppointmentService.isAppointmentEditable(appointment)).toBe(false);
    });

    it('returns false for in_progress appointment', () => {
      const appointment = createAppointment({ status: 'in_progress' });
      expect(AppointmentService.isAppointmentEditable(appointment)).toBe(false);
    });

    it('returns false for deleted appointment', () => {
      const appointment = createAppointment({ deletedAt: new Date().toISOString() });
      expect(AppointmentService.isAppointmentEditable(appointment)).toBe(false);
    });

    it('returns false for past appointment', () => {
      const appointment = createAppointment({ startTime: pastDate });
      expect(AppointmentService.isAppointmentEditable(appointment)).toBe(false);
    });

    it('returns false for past cancelled appointment', () => {
      const appointment = createAppointment({
        status: 'cancelled',
        startTime: pastDate,
      });
      expect(AppointmentService.isAppointmentEditable(appointment)).toBe(false);
    });
  });

  // ============================================================================
  // API Methods (with mocking)
  // ============================================================================

  describe('API Methods', () => {
    const mockInvoke = vi.mocked(ApiService.invoke);

    describe('getAppointments', () => {
      it('calls invoke with correct parameters', async () => {
        const filter = { patientId: 1 };
        mockInvoke.mockResolvedValueOnce({
          appointments: [],
          total: 0,
          hasMore: false,
        });

        await AppointmentService.getAppointments(filter, 20, 0);

        expect(mockInvoke).toHaveBeenCalledWith('get_appointments', {
          filter,
          limit: 20,
          offset: 0,
        });
      });

      it('uses default pagination values', async () => {
        mockInvoke.mockResolvedValueOnce({
          appointments: [],
          total: 0,
          hasMore: false,
        });

        await AppointmentService.getAppointments({});

        expect(mockInvoke).toHaveBeenCalledWith('get_appointments', {
          filter: {},
          limit: 20,
          offset: 0,
        });
      });
    });

    describe('getAppointment', () => {
      it('calls invoke with appointment ID', async () => {
        mockInvoke.mockResolvedValueOnce({ id: 1, title: 'Test' });

        await AppointmentService.getAppointment(1);

        expect(mockInvoke).toHaveBeenCalledWith('get_appointment', { id: 1 });
      });
    });

    describe('createAppointment', () => {
      it('calls invoke with input and createdBy', async () => {
        const input = {
          patientId: 1,
          title: 'Test',
          startTime: '2024-06-15T10:00:00Z',
          endTime: '2024-06-15T10:30:00Z',
        };
        mockInvoke.mockResolvedValueOnce({ id: 1, ...input });

        await AppointmentService.createAppointment(input, 'admin');

        expect(mockInvoke).toHaveBeenCalledWith('create_appointment', {
          input,
          createdBy: 'admin',
        });
      });
    });

    describe('updateAppointment', () => {
      it('calls invoke with id, input and updatedBy', async () => {
        const input = { title: 'Updated Title' };
        mockInvoke.mockResolvedValueOnce({ id: 1, title: 'Updated Title' });

        await AppointmentService.updateAppointment(1, input, 'admin');

        expect(mockInvoke).toHaveBeenCalledWith('update_appointment', {
          id: 1,
          input,
          updatedBy: 'admin',
        });
      });
    });

    describe('deleteAppointment', () => {
      it('calls invoke with appointment ID', async () => {
        mockInvoke.mockResolvedValueOnce(undefined);

        await AppointmentService.deleteAppointment(1);

        expect(mockInvoke).toHaveBeenCalledWith('delete_appointment', { id: 1 });
      });
    });

    describe('checkConflicts', () => {
      it('calls invoke with conflict check input', async () => {
        const input = {
          startTime: '2024-06-15T10:00:00Z',
          endTime: '2024-06-15T10:30:00Z',
          roomId: 1,
        };
        mockInvoke.mockResolvedValueOnce({ hasConflicts: false, conflicts: [] });

        await AppointmentService.checkConflicts(input);

        expect(mockInvoke).toHaveBeenCalledWith('check_conflicts', { input });
      });
    });

    describe('duplicateAppointment', () => {
      it('calls invoke with duplicate input', async () => {
        const input = {
          appointmentId: 1,
          targetDate: '2024-06-20T10:00:00Z',
        };
        mockInvoke.mockResolvedValueOnce({ id: 2 });

        await AppointmentService.duplicateAppointment(input, 'admin');

        expect(mockInvoke).toHaveBeenCalledWith('duplicate_appointment', {
          input,
          createdBy: 'admin',
        });
      });
    });
  });

  // ============================================================================
  // Room API Methods
  // ============================================================================

  describe('Room API Methods', () => {
    const mockInvoke = vi.mocked(ApiService.invoke);

    describe('getRooms', () => {
      it('calls invoke with filter', async () => {
        mockInvoke.mockResolvedValueOnce([]);

        await AppointmentService.getRooms({ activeOnly: true });

        expect(mockInvoke).toHaveBeenCalledWith('get_rooms', {
          filter: { activeOnly: true },
        });
      });
    });

    describe('getRoom', () => {
      it('calls invoke with room ID', async () => {
        mockInvoke.mockResolvedValueOnce({ id: 1, name: 'Room 1' });

        await AppointmentService.getRoom(1);

        expect(mockInvoke).toHaveBeenCalledWith('get_room', { id: 1 });
      });
    });

    describe('createRoom', () => {
      it('calls invoke with input', async () => {
        const input = { name: 'New Room' };
        mockInvoke.mockResolvedValueOnce({ id: 1, name: 'New Room' });

        await AppointmentService.createRoom(input);

        expect(mockInvoke).toHaveBeenCalledWith('create_room', { input });
      });
    });

    describe('updateRoom', () => {
      it('calls invoke with id and input', async () => {
        const input = { name: 'Updated Room' };
        mockInvoke.mockResolvedValueOnce({ id: 1, name: 'Updated Room' });

        await AppointmentService.updateRoom(1, input);

        expect(mockInvoke).toHaveBeenCalledWith('update_room', { id: 1, input });
      });
    });

    describe('deleteRoom', () => {
      it('calls invoke with room ID', async () => {
        mockInvoke.mockResolvedValueOnce(undefined);

        await AppointmentService.deleteRoom(1);

        expect(mockInvoke).toHaveBeenCalledWith('delete_room', { id: 1 });
      });
    });

    describe('getRoomAvailability', () => {
      it('calls invoke with roomId and checkTime', async () => {
        mockInvoke.mockResolvedValueOnce({ isAvailable: true });

        await AppointmentService.getRoomAvailability(1, '2024-06-15T10:00:00Z');

        expect(mockInvoke).toHaveBeenCalledWith('get_room_availability', {
          roomId: 1,
          checkTime: '2024-06-15T10:00:00Z',
        });
      });
    });
  });
});
