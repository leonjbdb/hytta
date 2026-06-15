import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import type { AvailabilityTarget, BedOccupancy, DateRange } from './types';

interface RawAvailabilityRow {
  kind: 'FULL_COTTAGE' | 'SLOT_ROOM';
  room_id: string | null;
  room_name_nb: string | null;
  room_name_en: string | null;
  room_icon: string | null;
  room_color: string | null;
  capacity: number | null;
  taken: number;
  pending: number;
  full_blocked: number;
  full_pending: number;
}

interface RawBedRow {
  bed_id: string;
  room_id: string;
  taken: number;
  pending: number;
}

interface RawPendingNameRow {
  target_kind: 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT';
  room_id: string | null;
  bed_id: string | null;
  display_name: string;
}

interface PendingNames {
  /** Names behind pending whole-cottage requests. */
  fullCottage: string[];
  /** Room/slot-level pending requester names, keyed by room id. */
  roomLevel: Map<string, string[]>;
  /** Bed-level pending requester names, keyed by bed id. */
  bed: Map<string, string[]>;
}

function uniq(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

/**
 * Names of everyone with a PENDING request overlapping the range, grouped by
 * what they targeted. Used to label the "awaiting approval" dots so a booker
 * can see who else is in the queue for a slot before requesting it too.
 */
async function getPendingNames(range: DateRange, excludeBookingId?: string): Promise<PendingNames> {
  const notEdited = excludeBookingId
    ? sql`AND (r.booking_id IS NULL OR r.booking_id != ${excludeBookingId})`
    : sql``;
  const rows = await db.all<RawPendingNameRow>(sql`
    SELECT
      r.target_kind AS target_kind,
      r.room_id AS room_id,
      r.bed_id AS bed_id,
      COALESCE(u.name, u.email, r.guest_name, 'Someone') AS display_name
    FROM reservation r
    LEFT JOIN user u ON u.id = r.user_id
    WHERE r.status = 'PENDING'
      AND r.start_date <= ${range.endDate}
      AND r.end_date   >= ${range.startDate}
      ${notEdited}
  `);

  const fullCottage: string[] = [];
  const roomLevel = new Map<string, string[]>();
  const bed = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, name: string) => {
    const list = map.get(key) ?? [];
    if (!list.includes(name)) list.push(name);
    map.set(key, list);
  };
  for (const row of rows) {
    if (row.target_kind === 'FULL_COTTAGE') {
      if (!fullCottage.includes(row.display_name)) fullCottage.push(row.display_name);
    } else if (row.target_kind === 'BED' && row.bed_id) {
      push(bed, row.bed_id, row.display_name);
    } else if (row.room_id) {
      push(roomLevel, row.room_id, row.display_name);
    }
  }
  return { fullCottage, roomLevel, bed };
}

/**
 * Per-bed occupancy across the range. A bed is `taken` when a CONFIRMED
 * reservation targets the bed itself, its whole room, or the whole cottage —
 * a booked bed is exclusive, so a double claimed by one person still blocks
 * everyone else.
 */
async function getBedOccupancy(
  range: DateRange,
  excludeBookingId: string | undefined,
  pendingNames: PendingNames,
): Promise<Map<string, BedOccupancy[]>> {
  // When editing, the booking's own rows must not count against itself.
  const notEdited = excludeBookingId
    ? sql`AND (r.booking_id IS NULL OR r.booking_id != ${excludeBookingId})`
    : sql``;
  const rows = await db.all<RawBedRow>(sql`
    SELECT
      b.id AS bed_id,
      b.room_id AS room_id,
      EXISTS (
        SELECT 1 FROM reservation r
        WHERE r.status = 'CONFIRMED'
          AND r.start_date <= ${range.endDate}
          AND r.end_date   >= ${range.startDate}
          ${notEdited}
          AND (
            (r.target_kind = 'BED' AND r.bed_id = b.id)
            OR (r.target_kind = 'ROOM' AND r.room_id = b.room_id)
            OR r.target_kind = 'FULL_COTTAGE'
          )
      ) AS taken,
      (
        SELECT COUNT(*) FROM reservation r
        WHERE r.status = 'PENDING'
          AND r.start_date <= ${range.endDate}
          AND r.end_date   >= ${range.startDate}
          ${notEdited}
          AND (
            (r.target_kind = 'BED' AND r.bed_id = b.id)
            OR (r.target_kind = 'ROOM' AND r.room_id = b.room_id)
            OR r.target_kind = 'FULL_COTTAGE'
          )
      ) AS pending
    FROM bed b
  `);

  const byRoom = new Map<string, BedOccupancy[]>();
  for (const row of rows) {
    const list = byRoom.get(row.room_id) ?? [];
    list.push({
      bedId: row.bed_id,
      taken: Number(row.taken) > 0,
      pending: Number(row.pending),
      // A bed's dot names whoever requested the bed itself or its whole room.
      pendingNames: uniq(
        pendingNames.bed.get(row.bed_id) ?? [],
        pendingNames.roomLevel.get(row.room_id) ?? [],
      ),
    });
    byRoom.set(row.room_id, list);
  }
  return byRoom;
}

/**
 * Returns availability for the closed range [start_date, end_date].
 * Every room — regardless of capacity mode — is exposed as a `SLOT_ROOM`
 * target with a computed capacity (sum of bed slots for BEDS-mode rooms,
 * `slot_count` for SLOTS-mode, NULL = unlimited). The booking UI then asks
 * for N participants up to `capacity - taken`.
 */
export async function getAvailability(
  range: DateRange,
  excludeBookingId?: string,
): Promise<AvailabilityTarget[]> {
  // When editing, the booking's own rows must not count against itself.
  const notEdited = excludeBookingId
    ? sql`AND (r.booking_id IS NULL OR r.booking_id != ${excludeBookingId})`
    : sql``;
  const rows = await db.all<RawAvailabilityRow>(sql`
    WITH room_capacity AS (
      SELECT
        room.id, room.name_nb, room.name_en, room.icon, room.color,
        CASE WHEN room.capacity_mode = 'SLOTS' THEN room.slot_count
             ELSE COALESCE((
               SELECT SUM(CASE bed.kind WHEN 'DOUBLE' THEN 2 ELSE 1 END)
               FROM bed WHERE bed.room_id = room.id
             ), 0)
        END AS capacity
      FROM room
    ),
    full_block AS (
      SELECT 1 AS blocked FROM reservation r
      WHERE r.status = 'CONFIRMED'
        AND r.target_kind = 'FULL_COTTAGE'
        AND r.start_date <= ${range.endDate}
        AND r.end_date   >= ${range.startDate}
        ${notEdited}
      LIMIT 1
    )
    SELECT 'FULL_COTTAGE' AS kind, NULL AS room_id, NULL AS room_name_nb,
           NULL AS room_name_en, NULL AS room_icon, NULL AS room_color,
           NULL AS capacity, 0 AS taken, 0 AS pending,
           EXISTS (
             SELECT 1 FROM reservation r
             WHERE r.status = 'CONFIRMED'
               AND r.start_date <= ${range.endDate}
               AND r.end_date   >= ${range.startDate}
               ${notEdited}
           ) AS full_blocked,
           (
             SELECT COUNT(*) FROM reservation r
             WHERE r.status = 'PENDING'
               AND r.target_kind = 'FULL_COTTAGE'
               AND r.start_date <= ${range.endDate}
               AND r.end_date   >= ${range.startDate}
               ${notEdited}
           ) AS full_pending
    UNION ALL
    SELECT
      'SLOT_ROOM', rc.id, rc.name_nb, rc.name_en, rc.icon, rc.color,
      rc.capacity,
      (
        SELECT COUNT(*) FROM reservation r
        WHERE r.status = 'CONFIRMED'
          AND r.target_kind IN ('SLOT','ROOM','BED')
          AND r.start_date <= ${range.endDate}
          AND r.end_date   >= ${range.startDate}
          ${notEdited}
          AND (
            r.room_id = rc.id
            OR r.bed_id IN (SELECT id FROM bed WHERE room_id = rc.id)
          )
      ) AS taken,
      (
        SELECT COUNT(*) FROM reservation r
        WHERE r.status = 'PENDING'
          AND r.target_kind IN ('SLOT','ROOM','BED')
          AND r.start_date <= ${range.endDate}
          AND r.end_date   >= ${range.startDate}
          ${notEdited}
          AND (
            r.room_id = rc.id
            OR r.bed_id IN (SELECT id FROM bed WHERE room_id = rc.id)
          )
      ) AS pending,
      EXISTS (SELECT 1 FROM full_block) AS full_blocked,
      0 AS full_pending
    FROM room_capacity rc
  `);

  const pendingNames = await getPendingNames(range, excludeBookingId);
  const bedsByRoom = await getBedOccupancy(range, excludeBookingId, pendingNames);

  return rows.map((row): AvailabilityTarget => {
    if (row.kind === 'FULL_COTTAGE') {
      return {
        kind: 'FULL_COTTAGE',
        available: row.full_blocked === 0,
        pending: Number(row.full_pending),
        pendingNames: pendingNames.fullCottage,
      };
    }
    const roomId = row.room_id!;
    const beds = bedsByRoom.get(roomId) ?? [];
    return {
      kind: 'SLOT_ROOM',
      roomId,
      nameNb: row.room_name_nb!,
      nameEn: row.room_name_en!,
      icon: row.room_icon!,
      color: row.room_color!,
      capacity: row.capacity,
      taken: Number(row.taken),
      pending: Number(row.pending),
      // Room dot names everyone pending in the room: room-level requests plus
      // every bed-level request inside it.
      pendingNames: uniq(
        pendingNames.roomLevel.get(roomId) ?? [],
        ...beds.map((b) => pendingNames.bed.get(b.bedId) ?? []),
      ),
      beds,
    };
  });
}
