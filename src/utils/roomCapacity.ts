export function roomTotal(otherBookings: number): number {
  return otherBookings;
}

export function roomOverbooked(otherBookings: number, capacity: number): boolean {
  return roomTotal(otherBookings) > capacity;
}
