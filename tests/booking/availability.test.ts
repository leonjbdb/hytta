import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
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

/**
 * Mirror of getAvailability() but parameterised on the test db (closed
 * interval). The production helper imports the singleton; tests need the
 * in-memory instance.
 */
function getAvailability(startDate: string, endDate: string) {
  return h.db.all<{
    kind: 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT_ROOM';
    room_id: string | null;
    bed_id: string | null;
    name: string | null;
    bed_label: string | null;
    conflict: number;
  }>(sql`
    WITH targets AS (
      SELECT 'FULL_COTTAGE' AS kind, NULL AS room_id, NULL AS bed_id, NULL AS name, NULL AS bed_label
      UNION ALL SELECT 'ROOM', room.id, NULL, room.name_nb, NULL FROM room WHERE room.capacity_mode='BEDS'
      UNION ALL SELECT 'BED',  bed.room_id, bed.id, NULL, bed.label FROM bed
      UNION ALL SELECT 'SLOT_ROOM', room.id, NULL, room.name_nb, NULL FROM room WHERE room.capacity_mode='SLOTS'
    )
    SELECT t.kind, t.room_id, t.bed_id, t.name, t.bed_label,
           EXISTS (
             SELECT 1 FROM reservation r
             WHERE r.status='CONFIRMED'
               AND r.start_date <= ${endDate}
               AND r.end_date   >= ${startDate}
               AND (
                 t.kind='FULL_COTTAGE' OR r.target_kind='FULL_COTTAGE'
                 OR (t.kind='ROOM' AND r.target_kind='ROOM' AND r.room_id=t.room_id)
                 OR (t.kind='ROOM' AND r.target_kind='BED'
                     AND r.bed_id IN (SELECT id FROM bed WHERE room_id=t.room_id))
                 OR (t.kind='BED'  AND r.target_kind='BED' AND r.bed_id=t.bed_id)
                 OR (t.kind='BED'  AND r.target_kind='ROOM'
                     AND r.room_id=(SELECT room_id FROM bed WHERE id=t.bed_id))
               )
           ) AS conflict
    FROM targets t
  `);
}

describe('Availability query', () => {
  it('empty calendar — every target is available', async () => {
    const rows = await getAvailability(dateOffset(1), dateOffset(3));
    // 1 cottage + 3 BEDS rooms + 3 beds + 1 SLOTS room (Outdoors) = 8
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.conflict === 0)).toBe(true);
  });

  it('FULL_COTTAGE booking — every BEDS target conflicts', async () => {
    await h.d1
      .prepare(
        `INSERT INTO reservation (id, user_id, target_kind, start_date, end_date, status, created_at) VALUES ('res1', '${ids.userId}', 'FULL_COTTAGE', '${dateOffset(10)}', '${dateOffset(13)}', 'CONFIRMED', strftime('%s','now'))`,
      )
      .run();
    const rows = await getAvailability(dateOffset(11), dateOffset(12));
    // SLOT_ROOM rows aren't checked by the BEDS-mode conflict subquery — they
    // need their own slot-count rule (covered by the conflict checker tests).
    const bedsTargets = rows.filter((r) => r.kind !== 'SLOT_ROOM');
    expect(bedsTargets.every((r) => r.conflict === 1)).toBe(true);
  });

  it('BED booking — RED room becomes unavailable transitively, others remain available', async () => {
    await h.d1
      .prepare(
        'INSERT INTO reservation (id, user_id, target_kind, bed_id, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        'res_bed',
        ids.userId,
        'BED',
        ids.beds.RED_SINGLE_1,
        dateOffset(20),
        dateOffset(22),
        'CONFIRMED',
        Math.floor(Date.now() / 1000),
      )
      .run();
    const rows = await getAvailability(dateOffset(20), dateOffset(22));

    expect(rows.find((r) => r.kind === 'FULL_COTTAGE')!.conflict).toBe(1);
    expect(rows.find((r) => r.kind === 'ROOM' && r.room_id === ids.rooms.BLUE)!.conflict).toBe(0);
    expect(rows.find((r) => r.kind === 'ROOM' && r.room_id === ids.rooms.YELLOW)!.conflict).toBe(0);
    expect(rows.find((r) => r.kind === 'ROOM' && r.room_id === ids.rooms.RED)!.conflict).toBe(1);
    expect(rows.find((r) => r.bed_id === ids.beds.RED_SINGLE_1)!.conflict).toBe(1);
    expect(rows.find((r) => r.bed_id === ids.beds.RED_SINGLE_2)!.conflict).toBe(0);
  });

  it('cancelled reservations do not appear in availability', async () => {
    await h.db
      .insert(reservations)
      .values({
        id: 'res_can',
        userId: ids.userId,
        targetKind: 'ROOM',
        roomId: ids.rooms.BLUE,
        bedId: null,
        startDate: dateOffset(30),
        endDate: dateOffset(32),
        status: 'CANCELLED',
      })
      .run();
    const rows = await getAvailability(dateOffset(30), dateOffset(32));
    expect(rows.every((r) => r.conflict === 0)).toBe(true);
  });
});
