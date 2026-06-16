/**
 * Pure capacity rules shared by the availability / occupancy code. No DB access,
 * so it is unit-testable in isolation.
 */
export interface RoomShape {
  id: string;
  mode: 'BEDS' | 'SLOTS';
  /** SLOTS capacity; null = unlimited. Ignored for BEDS rooms. */
  slotCount: number | null;
  /** Number of beds; only meaningful for BEDS rooms. */
  bedCount: number;
}

/**
 * Is a single day fully booked — i.e. no bookable space remains anywhere?
 *
 *   - A CONFIRMED whole-cottage reservation blocks everything.
 *   - Any unlimited SLOTS room (slotCount null) always has space, so its mere
 *     existence keeps every day bookable (short of a whole-cottage hold).
 *   - A BEDS room is full when every bed is taken (a booked bed is exclusive,
 *     matching the per-bed booking UI).
 *   - A finite SLOTS room is full when taken slots reach its cap.
 *
 * A room with zero capacity (no beds / zero slots) contributes no bookable
 * space and never keeps a day open. With no rooms at all nothing is bookable
 * yet, so the day is not "full" — the booking flow handles the no-rooms case.
 *
 * This is the calendar's grey-out / unselectable rule. It is deliberately
 * permissive: as long as ONE space is free, the day stays selectable so you can
 * request the available rooms/beds/slots even when others are taken.
 */
export function isDayFullyBooked(
  rooms: RoomShape[],
  fullCottage: boolean,
  takenBedsByRoom: Map<string, number>,
  takenSlotsByRoom: Map<string, number>,
): boolean {
  if (rooms.length === 0) return false;
  if (fullCottage) return true;
  if (rooms.some((r) => r.mode === 'SLOTS' && r.slotCount == null)) return false;
  for (const room of rooms) {
    if (room.mode === 'BEDS') {
      if (room.bedCount > 0 && (takenBedsByRoom.get(room.id) ?? 0) < room.bedCount) return false;
    } else {
      const cap = room.slotCount ?? 0;
      if (cap > 0 && (takenSlotsByRoom.get(room.id) ?? 0) < cap) return false;
    }
  }
  return true;
}
