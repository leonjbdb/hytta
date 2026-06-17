import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { makeTestDb, dateOffset, type TestDb } from '../helpers/db';
import { reservations } from '@/db/schema';

let h: TestDb;
let ids: Awaited<ReturnType<TestDb['seed']>>;

beforeEach(async () => {
  h = await makeTestDb();
  ids = await h.seed();
});
afterEach(async () => {
  await h.cleanup();
});

const bedRow = (
  over: Partial<typeof reservations.$inferInsert> & { bedId: string },
): typeof reservations.$inferInsert => ({
  bookingId: 'bk1',
  bookerId: ids.userId,
  userId: ids.userId,
  targetKind: 'BED',
  startDate: dateOffset(1),
  endDate: dateOffset(2),
  status: 'CONFIRMED',
  ...over,
});

describe('reservation_booking_user_active_idx (one live row per user per booking)', () => {
  it('rejects a second active row for the same booking + user', async () => {
    await h.db.insert(reservations).values(bedRow({ bedId: ids.beds.RED_SINGLE_1 })).run();
    await expect(
      h.db.insert(reservations).values(bedRow({ bedId: ids.beds.RED_SINGLE_2 })).run(),
    ).rejects.toThrow();
  });

  it('allows the duplicate once the first row is cancelled', async () => {
    await h.db
      .insert(reservations)
      .values(bedRow({ bedId: ids.beds.RED_SINGLE_1, status: 'CANCELLED' }))
      .run();
    // Partial index excludes CANCELLED rows, so an active row can take its place.
    await expect(
      h.db.insert(reservations).values(bedRow({ bedId: ids.beds.RED_SINGLE_2 })).run(),
    ).resolves.toBeDefined();
  });

  it('allows the same user once per distinct booking', async () => {
    await h.db.insert(reservations).values(bedRow({ bedId: ids.beds.RED_SINGLE_1 })).run();
    await expect(
      h.db
        .insert(reservations)
        .values(bedRow({ bookingId: 'bk2', bedId: ids.beds.RED_SINGLE_2 }))
        .run(),
    ).resolves.toBeDefined();
  });
});
