import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { reservations } from '@/db/schema';
import { makeTestDb, dateOffset, type TestDb } from '../helpers/db';

/**
 * `approveBookingResolvingConflicts` confirms one pending booking and, in the
 * same transaction, rejects the other members of its conflict cluster.
 */
describe('approveBookingResolvingConflicts', () => {
  let h: TestDb;
  let seed: Awaited<ReturnType<TestDb['seed']>>;

  beforeEach(async () => {
    h = await makeTestDb();
    seed = await h.seed();
    // A manager must exist for bookings by others to land as PENDING.
    await h.exec(`UPDATE user SET is_manager = 1 WHERE id = '${seed.userId}'`);
  });
  afterEach(async () => {
    await h.cleanup();
  });

  const statusOf = async (bookingId: string) =>
    (
      await h.db
        .select({ status: reservations.status })
        .from(reservations)
        .where(eq(reservations.bookingId, bookingId))
        .all()
    ).map((r) => r.status);

  // Booker = the non-manager, participants = guests, so every booking is
  // PENDING and the participant-busy check never trips.
  const requestBed = (bedId: string, guestName: string, from: number, to: number) =>
    h.service.createBooking(seed.otherUserId, {
      startDate: dateOffset(from),
      endDate: dateOffset(to),
      participants: [{ targetKind: 'BED', bedId, guestName }],
    });

  it('rejects the conflicting booking when its rival is approved', async () => {
    const a = await requestBed(seed.beds.RED_DOUBLE, 'Alice', 10, 12);
    const b = await requestBed(seed.beds.RED_DOUBLE, 'Bob', 11, 13);
    expect(await statusOf(a.bookingId)).toEqual(['PENDING']);
    expect(await statusOf(b.bookingId)).toEqual(['PENDING']);

    const result = await h.service.approveBookingResolvingConflicts(a.bookingId);

    expect(result.rejectedIds).toEqual([b.bookingId]);
    expect(await statusOf(a.bookingId)).toEqual(['CONFIRMED']);
    expect(await statusOf(b.bookingId)).toEqual(['CANCELLED']);
  });

  it('leaves non-conflicting pending bookings untouched', async () => {
    const a = await requestBed(seed.beds.RED_DOUBLE, 'Alice', 10, 12);
    const b = await requestBed(seed.beds.RED_DOUBLE, 'Bob', 11, 13);
    // c shares neither dates nor bed with a — not in the cluster.
    const c = await requestBed(seed.beds.RED_SINGLE_1, 'Cara', 40, 42);

    const result = await h.service.approveBookingResolvingConflicts(a.bookingId);

    expect(result.rejectedIds).toEqual([b.bookingId]);
    expect(await statusOf(c.bookingId)).toEqual(['PENDING']);
  });

  it('approves cleanly with no conflicts', async () => {
    const a = await requestBed(seed.beds.RED_DOUBLE, 'Alice', 10, 12);

    const result = await h.service.approveBookingResolvingConflicts(a.bookingId);

    expect(result.rejectedIds).toEqual([]);
    expect(await statusOf(a.bookingId)).toEqual(['CONFIRMED']);
  });

  it('rejects every rival in a larger conflict cluster', async () => {
    const a = await requestBed(seed.beds.RED_DOUBLE, 'Alice', 10, 15);
    const b = await requestBed(seed.beds.RED_DOUBLE, 'Bob', 11, 13);
    const c = await requestBed(seed.beds.RED_DOUBLE, 'Cara', 12, 14);

    const result = await h.service.approveBookingResolvingConflicts(a.bookingId);

    expect(result.rejectedIds.sort()).toEqual([b.bookingId, c.bookingId].sort());
    expect(await statusOf(a.bookingId)).toEqual(['CONFIRMED']);
    expect(await statusOf(b.bookingId)).toEqual(['CANCELLED']);
    expect(await statusOf(c.bookingId)).toEqual(['CANCELLED']);
  });
});
