import { describe, expect, it } from 'bun:test';
import { isDayFullyBooked, type RoomShape } from '@/lib/booking/capacity';

/**
 * The calendar grey-out / unselectable rule. The bug this locks in: a day was
 * marked "fully booked" whenever every room had *someone*, ignoring per-room
 * capacity — so a cottage with a multi-bed room, a free slot, or an unlimited
 * garden was wrongly blocked. You must be able to request a booking as long as
 * any space remains.
 */
const beds = (id: string, bedCount: number): RoomShape => ({ id, mode: 'BEDS', slotCount: null, bedCount });
const slots = (id: string, slotCount: number | null): RoomShape => ({ id, mode: 'SLOTS', slotCount, bedCount: 0 });
const m = (entries: [string, number][] = []) => new Map(entries);

describe('isDayFullyBooked', () => {
  it('is not full when no rooms exist', () => {
    expect(isDayFullyBooked([], false, m(), m())).toBe(false);
  });

  it('is full when a confirmed whole-cottage reservation covers the day', () => {
    expect(isDayFullyBooked([beds('a', 1)], true, m([['a', 0]]), m())).toBe(true);
  });

  it('is never full while an unlimited SLOTS room exists (the garden case)', () => {
    const rooms = [beds('blue', 1), slots('garden', null)];
    // Blue's only bed is taken, but the garden is unlimited → still bookable.
    expect(isDayFullyBooked(rooms, false, m([['blue', 1]]), m())).toBe(false);
  });

  it('keeps the day open while a BEDS room has a free bed', () => {
    // Red: 3 beds, 2 taken → one free.
    expect(isDayFullyBooked([beds('red', 3)], false, m([['red', 2]]), m())).toBe(false);
  });

  it('keeps the day open while a finite SLOTS room has a free slot', () => {
    // Gym: cap 2, 1 taken.
    expect(isDayFullyBooked([slots('gym', 2)], false, m(), m([['gym', 1]]))).toBe(false);
  });

  it('is full only when every BEDS room and finite SLOTS room is at capacity', () => {
    const rooms = [beds('blue', 1), beds('red', 3), slots('gym', 2)];
    const full = isDayFullyBooked(rooms, false, m([['blue', 1], ['red', 3]]), m([['gym', 2]]));
    expect(full).toBe(true);
    // Free one slot in the gym → no longer full.
    const open = isDayFullyBooked(rooms, false, m([['blue', 1], ['red', 3]]), m([['gym', 1]]));
    expect(open).toBe(false);
  });

  it('treats zero-capacity rooms as contributing no bookable space', () => {
    // A BEDS room with no beds + a SLOTS room with 0 cap → nothing bookable → full.
    expect(isDayFullyBooked([beds('empty', 0), slots('zero', 0)], false, m(), m())).toBe(true);
  });
});
