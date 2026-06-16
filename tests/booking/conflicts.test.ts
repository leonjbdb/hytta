import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { makeTestDb, dateOffset, type TestDb } from '../helpers/db';
import { ConflictError } from '@/lib/booking/errors';

let h: TestDb;
let ids: Awaited<ReturnType<TestDb['seed']>>;

beforeEach(async () => {
  h = await makeTestDb();
  ids = await h.seed();
});
afterEach(async () => {
  await h.cleanup();
});

const range = (offsetStart: number, offsetEnd: number) => ({
  startDate: dateOffset(offsetStart),
  endDate: dateOffset(offsetEnd),
});

describe('Conflict cases (closed interval)', () => {
  it('C1a — FULL_COTTAGE blocks any subsequent target', async () => {
    await h.service.create(ids.userId, { kind: 'FULL_COTTAGE', ...range(1, 4) });
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.BLUE,
        ...range(2, 3),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('C1b — any prior target blocks a new FULL_COTTAGE', async () => {
    await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.YELLOW,
      ...range(5, 7),
    });
    await expect(
      h.service.create(ids.userId, { kind: 'FULL_COTTAGE', ...range(4, 8) }),
    ).rejects.toThrow(ConflictError);
  });

  it('C2 — same ROOM overlapping range conflicts', async () => {
    await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.BLUE,
      ...range(10, 13),
    });
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.BLUE,
        ...range(11, 12),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('C2 — different ROOMs do not conflict (different participants)', async () => {
    await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.BLUE,
      ...range(20, 23),
    });
    await expect(
      h.service.create(ids.otherUserId, {
        kind: 'ROOM',
        roomId: ids.rooms.YELLOW,
        ...range(20, 23),
      }),
    ).resolves.toMatchObject({ targetKind: 'ROOM' });
  });

  it('C3 — booking RED room conflicts with existing BED in RED', async () => {
    await h.service.create(ids.userId, {
      kind: 'BED',
      bedId: ids.beds.RED_SINGLE_1,
      ...range(30, 32),
    });
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.RED,
        ...range(30, 32),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('C4 — same SINGLE bed overlapping conflicts (capacity 1)', async () => {
    await h.service.create(ids.userId, {
      kind: 'BED',
      bedId: ids.beds.RED_SINGLE_1,
      ...range(40, 42),
    });
    await expect(
      h.service.create(ids.otherUserId, {
        kind: 'BED',
        bedId: ids.beds.RED_SINGLE_1,
        ...range(41, 43),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('C4 — a DOUBLE bed is shareable by two people at once (capacity 2)', async () => {
    await h.service.create(ids.userId, {
      kind: 'BED',
      bedId: ids.beds.RED_DOUBLE,
      ...range(40, 42),
    });
    await expect(
      h.service.create(ids.otherUserId, {
        kind: 'BED',
        bedId: ids.beds.RED_DOUBLE,
        ...range(41, 43),
      }),
    ).resolves.toMatchObject({ targetKind: 'BED' });
  });

  it('C4 — a DOUBLE bed is full once two people overlap (a third is blocked)', async () => {
    await h.service.create(ids.userId, { kind: 'BED', bedId: ids.beds.RED_DOUBLE, ...range(40, 44) });
    await h.service.create(ids.otherUserId, { kind: 'BED', bedId: ids.beds.RED_DOUBLE, ...range(40, 44) });
    // A guest (booked by an existing user) can't take the now-full double.
    await expect(
      h.service.createBooking(ids.userId, {
        ...range(41, 43),
        participants: [{ targetKind: 'BED', bedId: ids.beds.RED_DOUBLE, guestName: 'Cousin' }],
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('C4 — a bed freed before the new stay can be rebooked (peak, not overlap count)', async () => {
    // user is in the single 40–42; otherUser arrives 43–45 — never concurrent.
    await h.service.create(ids.userId, {
      kind: 'BED',
      bedId: ids.beds.RED_SINGLE_1,
      ...range(40, 42),
    });
    await expect(
      h.service.create(ids.otherUserId, {
        kind: 'BED',
        bedId: ids.beds.RED_SINGLE_1,
        ...range(43, 45),
      }),
    ).resolves.toMatchObject({ targetKind: 'BED' });
  });

  it('C4 — different BEDs in RED do not conflict (different participants)', async () => {
    await h.service.create(ids.userId, {
      kind: 'BED',
      bedId: ids.beds.RED_SINGLE_1,
      ...range(50, 52),
    });
    await expect(
      h.service.create(ids.otherUserId, {
        kind: 'BED',
        bedId: ids.beds.RED_SINGLE_2,
        ...range(50, 52),
      }),
    ).resolves.toMatchObject({ targetKind: 'BED' });
  });

  it('rejects a participant who is already booked elsewhere on overlapping dates', async () => {
    await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.BLUE,
      ...range(95, 97),
    });
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.YELLOW,
        ...range(96, 98),
      }),
    ).rejects.toThrow(/participants/);
  });

  it('C5 — booking a BED conflicts with the parent ROOM already taken', async () => {
    await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.RED,
      ...range(60, 63),
    });
    await expect(
      h.service.create(ids.userId, {
        kind: 'BED',
        bedId: ids.beds.RED_SINGLE_1,
        ...range(60, 63),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('adjacent stays with one day gap do not conflict', async () => {
    // existing 70-72 (days 70,71,72) and new 74-75 → no shared day
    await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.BLUE,
      ...range(70, 72),
    });
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.BLUE,
        ...range(74, 75),
      }),
    ).resolves.toMatchObject({ targetKind: 'ROOM' });
  });

  it('back-to-back stays sharing a day conflict (closed interval)', async () => {
    await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.BLUE,
      ...range(76, 78),
    });
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.BLUE,
        ...range(78, 80),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('cancelled reservations do not block', async () => {
    const r = await h.service.create(ids.userId, {
      kind: 'ROOM',
      roomId: ids.rooms.YELLOW,
      ...range(82, 84),
    });
    await h.service.cancel(ids.userId, r.id);
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.YELLOW,
        ...range(82, 84),
      }),
    ).resolves.toMatchObject({ targetKind: 'ROOM' });
  });

  it('single-day reservation (start = end) is valid', async () => {
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: ids.rooms.BLUE,
        ...range(90, 90),
      }),
    ).resolves.toMatchObject({ targetKind: 'ROOM' });
  });
});

describe('Validation', () => {
  it('rejects past dates', async () => {
    await expect(
      h.service.create(ids.userId, { kind: 'FULL_COTTAGE', ...range(-2, 1) }),
    ).rejects.toThrow(/past/);
  });

  it('rejects end_date before start_date', async () => {
    await expect(
      h.service.create(ids.userId, { kind: 'FULL_COTTAGE', ...range(5, 3) }),
    ).rejects.toThrow(/end_date/);
  });

  it('rejects > 30 day stays', async () => {
    await expect(
      h.service.create(ids.userId, { kind: 'FULL_COTTAGE', ...range(1, 40) }),
    ).rejects.toThrow(/30 days/);
  });

  it('rejects unknown room id', async () => {
    await expect(
      h.service.create(ids.userId, {
        kind: 'ROOM',
        roomId: 'does-not-exist',
        ...range(1, 2),
      }),
    ).rejects.toThrow(/Room/);
  });

  it('rejects unknown bed id', async () => {
    await expect(
      h.service.create(ids.userId, {
        kind: 'BED',
        bedId: 'does-not-exist',
        ...range(1, 2),
      }),
    ).rejects.toThrow(/Bed/);
  });
});
