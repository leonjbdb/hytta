import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import type { AvailabilityTarget, BedOccupancy, DateRange, OccupantRef } from './types';

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
  kind: string;
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
 * Per-bed occupancy across the range. Each bed is a capacity unit (double = 2,
 * single = 1). `takenByOthers` is the PEAK concurrent seats held by others on
 * any single day — a whole-room / whole-cottage hold fills every seat — so a
 * bed stays bookable while `takenByOthers < capacity` (doubles are shareable,
 * and back-to-back stays don't both fill a bed).
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
      b.kind AS kind,
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

  // Peak concurrent seats held by OTHERS per bed: on each day, an exclusive
  // whole-room/cottage hold fills the bed (its full capacity), otherwise it's
  // the count of CONFIRMED bed bookings covering that day. The bed stays
  // bookable while this is below capacity.
  const peakRows = await db.all<{ bed_id: string; peak: number }>(sql`
    WITH RECURSIVE days(d) AS (
      SELECT ${range.startDate}
      UNION ALL SELECT date(d, '+1 day') FROM days WHERE date(d, '+1 day') <= ${range.endDate}
    )
    SELECT bed_id, COALESCE(MAX(cnt), 0) AS peak FROM (
      SELECT b.id AS bed_id, days.d AS d,
        CASE WHEN EXISTS (
          SELECT 1 FROM reservation r
          WHERE r.status = 'CONFIRMED'
            AND (r.target_kind = 'FULL_COTTAGE' OR (r.target_kind = 'ROOM' AND r.room_id = b.room_id))
            AND r.start_date <= days.d AND r.end_date >= days.d
            ${notEdited}
        )
        THEN (CASE b.kind WHEN 'DOUBLE' THEN 2 ELSE 1 END)
        ELSE (
          SELECT COUNT(*) FROM reservation r
          WHERE r.status = 'CONFIRMED' AND r.target_kind = 'BED' AND r.bed_id = b.id
            AND r.start_date <= days.d AND r.end_date >= days.d
            ${notEdited}
        )
        END AS cnt
      FROM bed b CROSS JOIN days
    )
    GROUP BY bed_id
  `);
  const peakByBed = new Map<string, number>();
  for (const p of peakRows) peakByBed.set(p.bed_id, Number(p.peak));

  // Confirmed occupants per bed — who actually holds it (bed-, room-, or
  // cottage-level). Drives the person badge shown in place of "Booked".
  const occupantRows = await db.all<{
    bed_id: string;
    user_id: string | null;
    name: string;
    is_guest: number;
    is_admin: number;
    is_manager: number;
    start_date: string;
    end_date: string;
  }>(sql`
    SELECT
      b.id AS bed_id,
      r.user_id AS user_id,
      COALESCE(u.name, u.email, r.guest_name, 'Someone') AS name,
      CASE WHEN r.user_id IS NULL THEN 1 ELSE 0 END AS is_guest,
      COALESCE(u.is_admin, 0) AS is_admin,
      COALESCE(u.is_manager, 0) AS is_manager,
      r.start_date AS start_date,
      r.end_date AS end_date
    FROM bed b
    JOIN reservation r
      ON r.status = 'CONFIRMED'
      AND r.start_date <= ${range.endDate}
      AND r.end_date   >= ${range.startDate}
      ${notEdited}
      AND (
        (r.target_kind = 'BED'  AND r.bed_id  = b.id)
        OR (r.target_kind = 'ROOM' AND r.room_id = b.room_id)
        OR r.target_kind = 'FULL_COTTAGE'
      )
    LEFT JOIN user u ON u.id = r.user_id
  `);
  const occupantsByBed = new Map<string, OccupantRef[]>();
  for (const o of occupantRows) {
    const list = occupantsByBed.get(o.bed_id) ?? [];
    // Dedupe by (name, dates) so a bed covered by overlapping holds isn't
    // listed twice, while distinct stays (incl. by the same person) are kept.
    if (!list.some((x) => x.name === o.name && x.startDate === o.start_date && x.endDate === o.end_date)) {
      list.push({
        userId: o.user_id,
        name: o.name,
        isGuest: Number(o.is_guest) === 1,
        isAdmin: Number(o.is_admin) === 1,
        isManager: Number(o.is_manager) === 1,
        startDate: o.start_date,
        endDate: o.end_date,
      });
    }
    occupantsByBed.set(o.bed_id, list);
  }

  const byRoom = new Map<string, BedOccupancy[]>();
  for (const row of rows) {
    const list = byRoom.get(row.room_id) ?? [];
    list.push({
      bedId: row.bed_id,
      capacity: row.kind === 'DOUBLE' ? 2 : 1,
      takenByOthers: peakByBed.get(row.bed_id) ?? 0,
      takenBy: occupantsByBed.get(row.bed_id) ?? [],
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
 * Confirmed slot/room occupants per room (SLOTS-mode rooms). Each CONFIRMED
 * SLOT or ROOM reservation contributes one occupant — the person who holds that
 * slot — so the picker can show who's already there, not just a count.
 */
async function getRoomOccupants(
  range: DateRange,
  excludeBookingId: string | undefined,
): Promise<Map<string, OccupantRef[]>> {
  const notEdited = excludeBookingId
    ? sql`AND (r.booking_id IS NULL OR r.booking_id != ${excludeBookingId})`
    : sql``;
  const rows = await db.all<{
    room_id: string;
    user_id: string | null;
    name: string;
    is_guest: number;
    is_admin: number;
    is_manager: number;
    start_date: string;
    end_date: string;
  }>(sql`
    SELECT
      r.room_id AS room_id,
      r.user_id AS user_id,
      COALESCE(u.name, u.email, r.guest_name, 'Someone') AS name,
      CASE WHEN r.user_id IS NULL THEN 1 ELSE 0 END AS is_guest,
      COALESCE(u.is_admin, 0) AS is_admin,
      COALESCE(u.is_manager, 0) AS is_manager,
      r.start_date AS start_date,
      r.end_date AS end_date
    FROM reservation r
    LEFT JOIN user u ON u.id = r.user_id
    WHERE r.status = 'CONFIRMED'
      AND r.target_kind IN ('SLOT', 'ROOM')
      AND r.room_id IS NOT NULL
      AND r.start_date <= ${range.endDate}
      AND r.end_date   >= ${range.startDate}
      ${notEdited}
  `);
  const byRoom = new Map<string, OccupantRef[]>();
  for (const row of rows) {
    const list = byRoom.get(row.room_id) ?? [];
    list.push({
      userId: row.user_id,
      name: row.name,
      isGuest: Number(row.is_guest) === 1,
      isAdmin: Number(row.is_admin) === 1,
      isManager: Number(row.is_manager) === 1,
      startDate: row.start_date,
      endDate: row.end_date,
    });
    byRoom.set(row.room_id, list);
  }
  return byRoom;
}

/**
 * Peak concurrent SLOT/ROOM/BED occupancy per room across the range — the most
 * slots used on any single day. This is what reduces bookable capacity: a slot
 * freed before your stay (or taken after it) leaves room, so two back-to-back
 * stays must NOT both count against the cap. Rooms with no occupancy are absent
 * (treated as 0 by callers).
 */
async function getRoomPeakOccupancy(
  range: DateRange,
  excludeBookingId: string | undefined,
): Promise<Map<string, number>> {
  const notEdited = excludeBookingId
    ? sql`AND (r.booking_id IS NULL OR r.booking_id != ${excludeBookingId})`
    : sql``;
  const rows = await db.all<{ room_id: string; peak: number }>(sql`
    WITH RECURSIVE days(d) AS (
      SELECT ${range.startDate}
      UNION ALL SELECT date(d, '+1 day') FROM days WHERE date(d, '+1 day') <= ${range.endDate}
    ),
    occ AS (
      SELECT COALESCE(r.room_id, bed.room_id) AS room_id, r.start_date AS s, r.end_date AS e
      FROM reservation r
      LEFT JOIN bed ON bed.id = r.bed_id
      WHERE r.status = 'CONFIRMED'
        AND r.target_kind IN ('SLOT','ROOM','BED')
        ${notEdited}
    )
    SELECT room_id, MAX(cnt) AS peak FROM (
      SELECT occ.room_id AS room_id, days.d AS d, COUNT(*) AS cnt
      FROM days JOIN occ ON occ.s <= days.d AND occ.e >= days.d
      WHERE occ.room_id IS NOT NULL
      GROUP BY occ.room_id, days.d
    )
    GROUP BY room_id
  `);
  const byRoom = new Map<string, number>();
  for (const row of rows) byRoom.set(row.room_id, Number(row.peak));
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
  const roomOccupants = await getRoomOccupants(range, excludeBookingId);
  const roomPeak = await getRoomPeakOccupancy(range, excludeBookingId);

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
      // Peak concurrent occupancy, not the raw overlap count — back-to-back
      // stays don't both consume a slot. Matches the conflict checker.
      taken: roomPeak.get(roomId) ?? 0,
      takenBy: roomOccupants.get(roomId) ?? [],
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
