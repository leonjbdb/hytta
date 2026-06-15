'use server';

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { getAvailability } from '@/lib/booking/availability';
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
  return [...byDay.values()];
}
