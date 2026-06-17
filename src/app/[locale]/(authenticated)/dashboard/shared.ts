import type { BedKind } from '@/db/schema';
import type { BedLike } from '@/lib/booking/bed-display';
import type { OccupancyCalendarRoom } from '@/components/booking/OccupancyCalendar.shared';

export interface DashboardRow {
  rowId: string;
  bookingId: string | null;
  participantId: string | null;
  participantName: string | null;
  participantEmail: string | null;
  participantIsAdmin: boolean | null;
  participantIsManager: boolean | null;
  guestName: string | null;
  bookerId: string | null;
  bookerName: string | null;
  bookerEmail: string | null;
  targetKind: 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT';
  roomNameNb: string | null;
  roomNameEn: string | null;
  roomIcon: string | null;
  roomColor: string | null;
  bedId: string | null;
  bedLabel: string | null;
  bedKind: BedKind | null;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  createdAt: number;
}

export interface BookingGroup {
  bookingId: string;
  startDate: string;
  endDate: string;
  bookerId: string | null;
  bookerName: string | null;
  rows: DashboardRow[];
  pending: boolean;
}

/**
 * Filter values for the dashboard "show" segmented control. "My Stays" and
 * "Others" partition every booking by whether the viewer is sleeping there:
 *   - `mine` ("My Stays"): stays the viewer is a participant in.
 *   - `booked` ("Others"): stays the viewer is NOT a participant in — other
 *     people's stays, regardless of who booked them.
 *   - `all`: every booking visible to the viewer.
 *
 * The `onlyMyBookings` flag — the "My Bookings" toggle, shown on every tab —
 * further restricts the result to bookings the viewer created (is the booker
 * of); e.g. on "Others" it surfaces stays the viewer booked for someone else.
 */
export type DashboardFilter = 'mine' | 'booked' | 'all';

export const DASHBOARD_FILTERS: ReadonlyArray<DashboardFilter> = ['mine', 'booked', 'all'];

export function filterGroups(
  groups: BookingGroup[],
  viewerId: string,
  filter: DashboardFilter,
  onlyMyBookings = false,
): BookingGroup[] {
  const isParticipant = (g: BookingGroup) =>
    g.rows.some((r) => r.participantId === viewerId);
  const base =
    filter === 'all'
      ? groups
      : filter === 'mine'
        ? groups.filter(isParticipant) // "My Stays" — where the viewer sleeps
        : groups.filter((g) => !isParticipant(g)); // "Others" — stays they're not in
  return onlyMyBookings ? base.filter((g) => g.bookerId === viewerId) : base;
}

/** Group rows by bookingId, flag pending if any row in the booking is. */
export function groupBookings(rs: DashboardRow[]): BookingGroup[] {
  const byKey = new Map<string, BookingGroup>();
  for (const r of rs) {
    const key = r.bookingId ?? r.rowId;
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(r);
      if (r.status === 'PENDING') existing.pending = true;
    } else {
      byKey.set(key, {
        bookingId: key,
        startDate: r.startDate,
        endDate: r.endDate,
        bookerId: r.bookerId,
        bookerName: r.bookerName ?? r.bookerEmail ?? null,
        rows: [r],
        pending: r.status === 'PENDING',
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export interface DashboardProps {
  /** Bookings starting strictly after today. */
  upcoming: DashboardRow[];
  /** Bookings active today (start ≤ today ≤ end). */
  current: DashboardRow[];
  /** Bookings ended before today. */
  past: DashboardRow[];
  viewerId: string;
  /** Booking manager — may cancel/delete any booking (but not modify others'). */
  isManager: boolean;
  /** Admin — may modify and delete any booking. */
  isAdmin: boolean;
  /** Cottage rooms — used by the date-filter calendar at the top. */
  rooms: OccupancyCalendarRoom[];
  /** Every bed in the cottage — used to number bed names by room position. */
  beds: BedLike[];
}

/** Keep only rows whose [startDate, endDate] interval covers `iso`. */
export function filterByDate(rows: DashboardRow[], iso: string): DashboardRow[] {
  return rows.filter((r) => r.startDate <= iso && r.endDate >= iso);
}
