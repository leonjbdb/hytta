'use server';

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { getAvailability } from '@/lib/booking/availability';
import { getDemoOccupancy } from '@/lib/booking/demo-availability';
import { isDemoMode } from '@/lib/demo-mode';
import { isDayFullyBooked, type RoomShape } from '@/lib/booking/capacity';
import type { AvailabilityTarget } from '@/lib/booking/types';
import { auth } from '@/lib/auth/config';

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const RangeSchema = z
  .object({ startDate: ISO, endDate: ISO })
  .refine((r) => r.startDate <= r.endDate, {
    message: 'end_date must be on or after start_date',
  });

export async function fetchAvailability(
  startDate: string,
  endDate: string,
  /** When editing, exclude this booking so its own placement reads as free. */
  excludeBookingId?: string,
): Promise<AvailabilityTarget[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const parsed = RangeSchema.safeParse({ startDate, endDate });
  if (!parsed.success) return [];
  return getAvailability(parsed.data, excludeBookingId);
}

export interface DayAssignment {
  /** Room id this person occupies; null when reservation is FULL_COTTAGE. */
  roomId: string | null;
  /** Display name (registered user name/email or guest name). */
  name: string;
  /** True when this slot is part of a FULL_COTTAGE reservation. */
  fullCottage: boolean;
}

export interface DayOccupancy {
  date: string;
  /** Room ids held by a CONFIRMED reservation covering this day. */
  roomIds: string[];
  /** True when a CONFIRMED FULL_COTTAGE reservation covers the day — UI greys it out. */
  fullCottage: boolean;
  /** Names of participants confirmed to stay that day (registered users + guests). */
  participants: string[];
  /** Per-person breakdown for the day-details dialog. Deduped by (roomId, name, fullCottage). */
  assignments: DayAssignment[];
  /**
   * True when at least one PENDING (requested, not yet approved) reservation
   * covers the day. Surfaced as a yellow "awaiting approval" dot rather than
   * the booked treatment — a pending request does not occupy the day.
   */
  pending: boolean;
  /** Names awaiting approval that day — tooltip on the pending dot. */
  pendingParticipants: string[];
  /**
   * True only when NO bookable space remains that day: a CONFIRMED whole-cottage
   * reservation covers it, or every room is at capacity. Capacity-aware — a room
   * with a free bed/slot (including any unlimited SLOTS room) keeps the day
   * bookable. Drives the calendar's greyed-out / unselectable treatment; mirrors
   * the model in `getAvailability` so the calendar matches what can be booked.
   */
  fullyBooked: boolean;
}

/**
 * Per-day room occupancy in [from, to]. Returns the room ids occupied each
 * day plus a flag for FULL_COTTAGE coverage and the human-readable list of
 * participants staying.
 */
export async function fetchOccupancy(from: string, to: string): Promise<DayOccupancy[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const parsed = z.object({ from: ISO, to: ISO }).safeParse({ from, to });
  if (!parsed.success || parsed.data.from > parsed.data.to) return [];
  if (isDemoMode()) return getDemoOccupancy(parsed.data.from, parsed.data.to);

  const rows = await db.all<{
    d: string;
    room_id: string | null;
    full_cottage: number;
    participant: string | null;
    status: string;
  }>(sql`
    WITH RECURSIVE days(d) AS (
      SELECT ${parsed.data.from}
      UNION ALL
      SELECT date(d, '+1 day') FROM days WHERE date(d, '+1 day') <= ${parsed.data.to}
    ),
    occupancy AS (
      SELECT r.start_date AS s, r.end_date AS e, r.room_id AS room_id, 0 AS full_cottage,
             COALESCE(u.name, u.email, r.guest_name) AS participant, r.status AS status
      FROM reservation r
      LEFT JOIN user u ON u.id = r.user_id
      WHERE r.status IN ('PENDING','CONFIRMED') AND r.target_kind IN ('ROOM','SLOT')
      UNION ALL
      SELECT r.start_date, r.end_date, bed.room_id, 0,
             COALESCE(u.name, u.email, r.guest_name), r.status
      FROM reservation r
      JOIN bed ON bed.id = r.bed_id
      LEFT JOIN user u ON u.id = r.user_id
      WHERE r.status IN ('PENDING','CONFIRMED') AND r.target_kind = 'BED'
      UNION ALL
      SELECT r.start_date, r.end_date, NULL, 1,
             COALESCE(u.name, u.email, r.guest_name), r.status
      FROM reservation r
      LEFT JOIN user u ON u.id = r.user_id
      WHERE r.status IN ('PENDING','CONFIRMED') AND r.target_kind = 'FULL_COTTAGE'
    )
    SELECT days.d AS d, occupancy.room_id AS room_id,
           occupancy.full_cottage AS full_cottage,
           occupancy.participant AS participant,
           occupancy.status AS status
    FROM days
    JOIN occupancy ON occupancy.s <= days.d AND occupancy.e >= days.d
    ORDER BY days.d
  `);

  const byDay = new Map<string, DayOccupancy>();
  const seenAssignment = new Map<string, Set<string>>();
  for (const row of rows) {
    const entry =
      byDay.get(row.d) ??
      {
        date: row.d,
        roomIds: [],
        fullCottage: false,
        participants: [],
        assignments: [],
        pending: false,
        pendingParticipants: [],
        fullyBooked: false,
      };

    // PENDING requests don't occupy the day — they surface as a yellow dot.
    // Only CONFIRMED reservations drive the booked treatment (icons / dimming).
    if (row.status === 'PENDING') {
      entry.pending = true;
      if (row.participant && !entry.pendingParticipants.includes(row.participant)) {
        entry.pendingParticipants.push(row.participant);
      }
      byDay.set(row.d, entry);
      continue;
    }

    const isFull = row.full_cottage === 1;
    if (isFull) entry.fullCottage = true;
    if (row.room_id && !entry.roomIds.includes(row.room_id)) entry.roomIds.push(row.room_id);
    if (row.participant && !entry.participants.includes(row.participant)) {
      entry.participants.push(row.participant);
    }
    if (row.participant) {
      const key = `${isFull ? '*' : row.room_id ?? ''}|${row.participant}`;
      const seen = seenAssignment.get(row.d) ?? new Set<string>();
      if (!seen.has(key)) {
        seen.add(key);
        entry.assignments.push({
          roomId: isFull ? null : row.room_id,
          name: row.participant,
          fullCottage: isFull,
        });
        seenAssignment.set(row.d, seen);
      }
    }
    byDay.set(row.d, entry);
  }

  // --- Capacity-aware "fully booked" per day -------------------------------
  // A day is fully booked only when no bookable space remains. Room shapes:
  //   - SLOTS, slot_count NULL → unlimited: always bookable.
  //   - SLOTS, slot_count N    → full when N confirmed slot/room rows cover it.
  //   - BEDS                   → full when every bed is taken (a booked bed is
  //                              exclusive; this matches the per-bed UI).
  // A CONFIRMED whole-cottage reservation blocks everything regardless.
  const roomShapes = await db.all<{
    id: string;
    mode: string;
    slot_count: number | null;
    bed_count: number;
  }>(sql`
    SELECT room.id AS id, room.capacity_mode AS mode, room.slot_count AS slot_count,
           (SELECT COUNT(*) FROM bed WHERE bed.room_id = room.id) AS bed_count
    FROM room
  `);
  const shapes: RoomShape[] = roomShapes.map((r) => ({
    id: r.id,
    mode: r.mode === 'SLOTS' ? 'SLOTS' : 'BEDS',
    slotCount: r.slot_count,
    bedCount: Number(r.bed_count),
  }));
  const hasUnlimitedSlots = shapes.some((r) => r.mode === 'SLOTS' && r.slotCount == null);

  // The heavy per-room/day occupancy is only needed when the answer isn't
  // already settled by "no rooms" or "an unlimited room always has space".
  const needsDetail = shapes.length > 0 && !hasUnlimitedSlots;
  const bedTaken = new Map<string, Map<string, number>>(); // day -> room -> taken beds
  const slotTaken = new Map<string, Map<string, number>>(); // day -> room -> taken slots
  if (needsDetail) {
    const bedRows = await db.all<{ d: string; room_id: string; taken: number }>(sql`
      WITH RECURSIVE days(d) AS (
        SELECT ${parsed.data.from}
        UNION ALL SELECT date(d, '+1 day') FROM days WHERE date(d, '+1 day') <= ${parsed.data.to}
      )
      SELECT days.d AS d, b.room_id AS room_id, COUNT(DISTINCT b.id) AS taken
      FROM days
      CROSS JOIN bed b
      JOIN reservation r
        ON r.status = 'CONFIRMED'
        AND r.start_date <= days.d AND r.end_date >= days.d
        AND (
          (r.target_kind = 'BED'  AND r.bed_id  = b.id)
          OR (r.target_kind = 'ROOM' AND r.room_id = b.room_id)
          OR r.target_kind = 'FULL_COTTAGE'
        )
      GROUP BY days.d, b.room_id
    `);
    for (const row of bedRows) {
      const m = bedTaken.get(row.d) ?? new Map<string, number>();
      m.set(row.room_id, Number(row.taken));
      bedTaken.set(row.d, m);
    }
    const slotRows = await db.all<{ d: string; room_id: string; taken: number }>(sql`
      WITH RECURSIVE days(d) AS (
        SELECT ${parsed.data.from}
        UNION ALL SELECT date(d, '+1 day') FROM days WHERE date(d, '+1 day') <= ${parsed.data.to}
      )
      SELECT days.d AS d, r.room_id AS room_id, COUNT(*) AS taken
      FROM days
      JOIN reservation r
        ON r.status = 'CONFIRMED' AND r.target_kind IN ('SLOT', 'ROOM')
        AND r.room_id IS NOT NULL
        AND r.start_date <= days.d AND r.end_date >= days.d
      GROUP BY days.d, r.room_id
    `);
    for (const row of slotRows) {
      const m = slotTaken.get(row.d) ?? new Map<string, number>();
      m.set(row.room_id, Number(row.taken));
      slotTaken.set(row.d, m);
    }
  }

  const EMPTY = new Map<string, number>();
  for (const entry of byDay.values()) {
    entry.fullyBooked = isDayFullyBooked(
      shapes,
      entry.fullCottage,
      bedTaken.get(entry.date) ?? EMPTY,
      slotTaken.get(entry.date) ?? EMPTY,
    );
  }
  return [...byDay.values()];
}
