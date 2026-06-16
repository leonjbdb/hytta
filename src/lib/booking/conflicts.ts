import { sql } from 'drizzle-orm';
import { BED_CAPACITY, beds, reservations, rooms } from '@/db/schema';
import type { DB } from '@/db/drizzle';
import type { TargetSpec } from './types';

/**
 * Detects whether the requested target+range conflicts with any CONFIRMED
 * reservation. PENDING requests do **not** block — multiple people can
 * request the same slot in parallel and a manager picks which one to
 * approve. Designed to run inside a `BEGIN IMMEDIATE` transaction so the
 * caller is the sole writer for the duration of the check + insert.
 *
 * Cases (all closed-interval — both endpoints inclusive):
 *   C1: any reservation in the range blocks a new FULL_COTTAGE target.
 *   C2: ROOM vs same ROOM.
 *   C3: ROOM vs any BED inside that ROOM.
 *   C4: BED vs same BED.
 *   C5: BED vs the BED's parent ROOM.
 *   C6: ROOM (whole) vs any SLOT in same room.
 *   C7: SLOT vs whole ROOM of same room.
 *   C8: SLOT capacity — count of SLOT/ROOM/BED rows for the room ≥ capacity.
 *
 * `excludeBookingId` lets the caller skip rows that belong to the booking
 * being assembled — multiple participants in the same booking should not
 * conflict with each other.
 */
export interface ConflictChecker {
  check(
    spec: TargetSpec,
    range: { startDate: string; endDate: string },
    options?: { excludeBookingId?: string },
  ): Promise<boolean>;
}

export function createConflictChecker(
  database: DB,
  options: { demoMode?: boolean } = {},
): ConflictChecker {
  if (options.demoMode) {
    return {
      async check(spec, range, options) {
        const [reservationRows, bedRows, roomRows] = await Promise.all([
          database.select().from(reservations).all(),
          database.select().from(beds).all(),
          database.select().from(rooms).all(),
        ]);
        const days: string[] = [];
        const cursor = new Date(`${range.startDate}T00:00:00.000Z`);
        const end = new Date(`${range.endDate}T00:00:00.000Z`);
        while (cursor <= end) {
          days.push(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        const included = (bookingId: string | null) =>
          !options?.excludeBookingId ||
          bookingId == null ||
          bookingId !== options.excludeBookingId;
        const overlaps = (startDate: string, endDate: string) =>
          startDate <= range.endDate && endDate >= range.startDate;
        const confirmed = reservationRows.filter(
          (row) =>
            row.status === 'CONFIRMED' &&
            included(row.bookingId) &&
            overlaps(row.startDate, row.endDate),
        );
        const bedRoom = (bedId: string | null) =>
          bedId ? bedRows.find((bed) => bed.id === bedId)?.roomId ?? null : null;
        const roomCapacity = (roomId: string): number | null => {
          const room = roomRows.find((r) => r.id === roomId);
          if (!room) return 0;
          if (room.capacityMode === 'SLOTS') return room.slotCount;
          return bedRows
            .filter((bed) => bed.roomId === roomId)
            .reduce((sum, bed) => sum + BED_CAPACITY[bed.kind], 0);
        };
        const covers = (startDate: string, endDate: string, day: string) =>
          startDate <= day && endDate >= day;

        if (spec.kind === 'FULL_COTTAGE') return confirmed.length > 0;

        if (spec.kind === 'ROOM') {
          return confirmed.some(
            (row) =>
              row.targetKind === 'FULL_COTTAGE' ||
              (row.targetKind === 'ROOM' && row.roomId === spec.roomId) ||
              (row.targetKind === 'BED' && bedRoom(row.bedId) === spec.roomId) ||
              (row.targetKind === 'SLOT' && row.roomId === spec.roomId),
          );
        }

        if (spec.kind === 'BED') {
          const roomId = bedRoom(spec.bedId);
          if (!roomId) return false;
          if (
            confirmed.some(
              (row) =>
                row.targetKind === 'FULL_COTTAGE' ||
                (row.targetKind === 'ROOM' && row.roomId === roomId),
            )
          ) {
            return true;
          }
          const bed = bedRows.find((b) => b.id === spec.bedId);
          const capacity = bed ? BED_CAPACITY[bed.kind] : 0;
          const peak = days.reduce((max, day) => {
            const taken = confirmed.filter(
              (row) =>
                row.targetKind === 'BED' &&
                row.bedId === spec.bedId &&
                covers(row.startDate, row.endDate, day),
            ).length;
            return Math.max(max, taken);
          }, 0);
          return peak >= capacity;
        }

        if (
          confirmed.some(
            (row) =>
              row.targetKind === 'FULL_COTTAGE' ||
              (row.targetKind === 'ROOM' && row.roomId === spec.roomId),
          )
        ) {
          return true;
        }
        const capacity = roomCapacity(spec.roomId);
        if (capacity == null) return false;
        const peak = days.reduce((max, day) => {
          const taken = confirmed.filter((row) => {
            if (!covers(row.startDate, row.endDate, day)) return false;
            if (row.targetKind === 'SLOT' || row.targetKind === 'ROOM') {
              return row.roomId === spec.roomId;
            }
            return row.targetKind === 'BED' && bedRoom(row.bedId) === spec.roomId;
          }).length;
          return Math.max(max, taken);
        }, 0);
        return peak >= capacity;
      },
    };
  }

  return {
    async check(spec, range, options) {
      const targetKind = spec.kind;
      const roomId =
        spec.kind === 'ROOM' || spec.kind === 'SLOT' ? spec.roomId : null;
      const bedId = spec.kind === 'BED' ? spec.bedId : null;
      const excludeBookingId = options?.excludeBookingId ?? null;

      const exclude = sql`(${excludeBookingId} IS NULL OR r.booking_id IS NULL OR r.booking_id != ${excludeBookingId})`;

      if (targetKind === 'FULL_COTTAGE' || targetKind === 'ROOM') {
        // Exclusive holds: a whole-cottage or whole-room booking needs every
        // overlapping space (rooms, beds, slots) free. Beds are handled below
        // for BED targets; here they only matter as blockers of a ROOM hold.
        const result = await database.all<{ found: 1 }>(sql`
          SELECT 1 AS found
          FROM reservation r
          WHERE r.status = 'CONFIRMED'
            AND r.start_date <= ${range.endDate}
            AND r.end_date   >= ${range.startDate}
            AND ${exclude}
            AND (
              ${targetKind} = 'FULL_COTTAGE'
              OR r.target_kind = 'FULL_COTTAGE'
              OR (${targetKind} = 'ROOM' AND r.target_kind = 'ROOM' AND r.room_id = ${roomId})
              OR (${targetKind} = 'ROOM' AND r.target_kind = 'BED'
                  AND r.bed_id IN (SELECT id FROM bed WHERE room_id = ${roomId}))
              OR (${targetKind} = 'ROOM' AND r.target_kind = 'SLOT' AND r.room_id = ${roomId})
            )
          LIMIT 1
        `);
        return result.length > 0;
      }

      if (targetKind === 'BED') {
        // A whole-cottage or whole-room hold blocks the bed entirely.
        const blockers = await database.all<{ found: 1 }>(sql`
          SELECT 1 AS found
          FROM reservation r
          WHERE r.status = 'CONFIRMED'
            AND r.start_date <= ${range.endDate}
            AND r.end_date   >= ${range.startDate}
            AND ${exclude}
            AND (
              r.target_kind = 'FULL_COTTAGE'
              OR (r.target_kind = 'ROOM' AND r.room_id = (SELECT room_id FROM bed WHERE id = ${bedId}))
            )
          LIMIT 1
        `);
        if (blockers.length > 0) return true;

        // Otherwise capacity-share: a double sleeps two, a single one. Block
        // only when the PEAK concurrent bed bookings on any single day reach
        // capacity — so a double can be shared and back-to-back stays (or a
        // stay that ends before another begins) don't both fill it.
        const capRows = await database.all<{ capacity: number }>(sql`
          SELECT (CASE kind WHEN 'DOUBLE' THEN 2 ELSE 1 END) AS capacity
          FROM bed WHERE id = ${bedId}
        `);
        const capacity = capRows[0]?.capacity;
        if (capacity == null) return false; // unknown bed
        const peakRows = await database.all<{ peak: number }>(sql`
          WITH RECURSIVE days(d) AS (
            SELECT ${range.startDate}
            UNION ALL SELECT date(d, '+1 day') FROM days WHERE date(d, '+1 day') <= ${range.endDate}
          )
          SELECT COALESCE(MAX(cnt), 0) AS peak FROM (
            SELECT days.d AS d, COUNT(*) AS cnt
            FROM days JOIN reservation r
              ON r.status = 'CONFIRMED' AND r.target_kind = 'BED' AND r.bed_id = ${bedId}
              AND r.start_date <= days.d AND r.end_date >= days.d AND ${exclude}
            GROUP BY days.d
          )
        `);
        return Number(peakRows[0]?.peak ?? 0) >= capacity;
      }

      // SLOT booking: blocked by FULL_COTTAGE or whole-room booking, then
      // capacity-checked against the room's computed capacity.
      const blockerRows = await database.all<{ found: 1 }>(sql`
        SELECT 1 AS found
        FROM reservation r
        WHERE r.status = 'CONFIRMED'
          AND r.start_date <= ${range.endDate}
          AND r.end_date   >= ${range.startDate}
          AND ${exclude}
          AND (
            r.target_kind = 'FULL_COTTAGE'
            OR (r.target_kind = 'ROOM' AND r.room_id = ${roomId})
          )
        LIMIT 1
      `);
      if (blockerRows.length > 0) return true;

      const capacityRows = await database.all<{ capacity: number | null }>(sql`
        SELECT
          (CASE WHEN room.capacity_mode = 'SLOTS' THEN room.slot_count
                ELSE COALESCE((
                  SELECT SUM(CASE bed.kind WHEN 'DOUBLE' THEN 2 ELSE 1 END)
                  FROM bed WHERE bed.room_id = room.id
                ), 0)
           END) AS capacity
        FROM room WHERE room.id = ${roomId}
      `);
      const capacity = capacityRows[0]?.capacity;
      if (capacity == null) return false; // unknown room or unlimited capacity

      // Capacity is per-DAY: a slot freed before your stay (or taken after it)
      // doesn't reduce it. Compare against the PEAK concurrent occupancy on any
      // single day in the range — not the total count of overlapping rows, which
      // would wrongly count two back-to-back stays as both filling a slot.
      const peakRows = await database.all<{ peak: number }>(sql`
        WITH RECURSIVE days(d) AS (
          SELECT ${range.startDate}
          UNION ALL SELECT date(d, '+1 day') FROM days WHERE date(d, '+1 day') <= ${range.endDate}
        ),
        occ AS (
          SELECT r.start_date AS s, r.end_date AS e
          FROM reservation r
          WHERE r.status = 'CONFIRMED'
            AND r.target_kind IN ('SLOT','ROOM','BED')
            AND ${exclude}
            AND (
              r.room_id = ${roomId}
              OR r.bed_id IN (SELECT id FROM bed WHERE room_id = ${roomId})
            )
        )
        SELECT COALESCE(MAX(cnt), 0) AS peak FROM (
          SELECT days.d AS d, COUNT(*) AS cnt
          FROM days JOIN occ ON occ.s <= days.d AND occ.e >= days.d
          GROUP BY days.d
        )
      `);
      const peak = Number(peakRows[0]?.peak ?? 0);
      return peak >= capacity;
    },
  };
}
