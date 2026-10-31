/** Bookings in the room at that time, counting the one being saved: the
 *  conflict check leaves it out of `otherBookings`, also when editing it. */
export function roomTotal(otherBookings: number): number {
  return otherBookings + 1;
}

export function roomOverbooked(otherBookings: number, capacity: number): boolean {
  return roomTotal(otherBookings) > capacity;
}
