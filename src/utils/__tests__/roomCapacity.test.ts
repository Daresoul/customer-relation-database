import { describe, it, expect } from 'vitest';
import { roomTotal, roomOverbooked } from '../roomCapacity';

// Final review: editing counted only the other bookings, one too few, so moving
// a visit into a full single room gave no warning.
describe('room capacity', () => {
  it('counts the appointment being saved with the others at that time', () => {
    expect(roomTotal(1)).toBe(2);
    expect(roomTotal(0)).toBe(1);
  });

  it('is overbooked when that total is above the capacity', () => {
    expect(roomOverbooked(1, 1)).toBe(true);
    expect(roomOverbooked(0, 1)).toBe(false);
    expect(roomOverbooked(1, 2)).toBe(false);
  });
});
