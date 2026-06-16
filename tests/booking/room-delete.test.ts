import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { makeTestDb, dateOffset, type TestDb } from '../helpers/db';

/**
 * Guards the admin room-delete path (`deleteRoom` →
 * `ReservationService.roomHasActiveReservations`). The bug this locks in:
 * cancelling a booking keeps its row with status CANCELLED, so a room whose
 * bookings were all cancelled must still be deletable — only ACTIVE
 * (PENDING/CONFIRMED) reservations may block deletion.
 */
let h: TestDb;
let ids: Awaited<ReturnType<TestDb['seed']>>;

beforeEach(async () => {
  h = await makeTestDb();
  ids = await h.seed();
});
afterEach(async () => {
  await h.cleanup();
});

const range = (a: number, b: number) => ({ startDate: dateOffset(a), endDate: dateOffset(b) });

describe('roomHasActiveReservations (room-delete guard)', () => {
  it('is false for a room with no reservations', async () => {
    expect(await h.service.roomHasActiveReservations(ids.rooms.BLUE)).toBe(false);
  });

  it('is true while a ROOM reservation is active, and false once cancelled', async () => {
    const r = await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.BLUE,
      ...range(5, 7),
    });
    expect(await h.service.roomHasActiveReservations(ids.rooms.BLUE)).toBe(true);

    await h.service.cancel(ids.userId, r.id);
    // The cancelled row still exists — but must NOT block deletion.
    expect(await h.service.roomHasActiveReservations(ids.rooms.BLUE)).toBe(false);
  });

  it('counts a BED reservation against its room, and clears on cancel', async () => {
    const r = await h.service.create(ids.userId, {
      kind: 'BED',
      bedId: ids.beds.RED_DOUBLE,
      ...range(5, 7),
    });
    expect(await h.service.roomHasActiveReservations(ids.rooms.RED)).toBe(true);
    // A different room is unaffected.
    expect(await h.service.roomHasActiveReservations(ids.rooms.BLUE)).toBe(false);

    await h.service.cancel(ids.userId, r.id);
    expect(await h.service.roomHasActiveReservations(ids.rooms.RED)).toBe(false);
  });

  it('counts a SLOT reservation on a slots-mode room, and clears on cancel', async () => {
    const r = await h.service.create(ids.userId, {
      kind: 'SLOT',
      roomId: ids.rooms.OUTDOORS,
      ...range(5, 7),
    });
    expect(await h.service.roomHasActiveReservations(ids.rooms.OUTDOORS)).toBe(true);

    await h.service.cancel(ids.userId, r.id);
    expect(await h.service.roomHasActiveReservations(ids.rooms.OUTDOORS)).toBe(false);
  });
});
