import { sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
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

export function createConflictChecker(database: DB): ConflictChecker {
  return {
    async check(spec, range, options) {
      const targetKind = spec.kind;
      const roomId =
        spec.kind === 'ROOM' || spec.kind === 'SLOT' ? spec.roomId : null;
      const bedId = spec.kind === 'BED' ? spec.bedId : null;
      const excludeBookingId = options?.excludeBookingId ?? null;

      const exclude = sql`(${excludeBookingId} IS NULL OR r.booking_id IS NULL OR r.booking_id != ${excludeBookingId})`;

      if (targetKind !== 'SLOT') {
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
              OR (${targetKind} = 'BED' AND r.target_kind = 'BED' AND r.bed_id = ${bedId})
              OR (${targetKind} = 'BED' AND r.target_kind = 'ROOM'
                  AND r.room_id = (SELECT room_id FROM bed WHERE id = ${bedId}))
            )
          LIMIT 1
        `);
        return result.length > 0;
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

      const capacityRows = await database.all<{ capacity: number | null; taken: number }>(sql`
        SELECT
          (CASE WHEN room.capacity_mode = 'SLOTS' THEN room.slot_count
                ELSE COALESCE((
                  SELECT SUM(CASE bed.kind WHEN 'DOUBLE' THEN 2 ELSE 1 END)
                  FROM bed WHERE bed.room_id = room.id
                ), 0)
           END) AS capacity,
          (
            SELECT COUNT(*) FROM reservation r
            WHERE r.status = 'CONFIRMED'
              AND r.target_kind IN ('SLOT','ROOM','BED')
              AND r.start_date <= ${range.endDate}
              AND r.end_date   >= ${range.startDate}
              AND ${exclude}
              AND (
                r.room_id = room.id
                OR r.bed_id IN (SELECT id FROM bed WHERE room_id = room.id)
              )
          ) AS taken
        FROM room WHERE room.id = ${roomId}
      `);
      const row = capacityRows[0];
      if (!row) return false;
      if (row.capacity == null) return false; // unlimited
      return row.taken >= row.capacity;
    },
  };
}
