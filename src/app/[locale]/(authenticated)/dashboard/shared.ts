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
 * Filter values for the dashboard "show" segmented control.
 *   - `mine` ("My Bookings"): bookings the viewer is involved in — either as
 *     the booker or as a participant. The `myStaysOnly` flag narrows this to
 *     just the bookings where the viewer is actually staying.
 *   - `booked` ("Others"): bookings the viewer has nothing to do with — neither
 *     the booker nor a participant — i.e. other people's bookings.
 *   - `all`: every booking visible to the viewer.
 */
export type DashboardFilter = 'mine' | 'booked' | 'all';

export const DASHBOARD_FILTERS: ReadonlyArray<DashboardFilter> = ['mine', 'booked', 'all'];

export function filterGroups(
  groups: BookingGroup[],
  viewerId: string,
  filter: DashboardFilter,
  myStaysOnly = false,
): BookingGroup[] {
  if (filter === 'all') return groups;
  const isParticipant = (g: BookingGroup) =>
    g.rows.some((r) => r.participantId === viewerId);
  if (filter === 'mine') {
    const mine = groups.filter((g) => g.bookerId === viewerId || isParticipant(g));
    return myStaysOnly ? mine.filter(isParticipant) : mine;
  }
  // 'booked' ("Others") — bookings the viewer isn't involved in at all.
  return groups.filter((g) => g.bookerId !== viewerId && !isParticipant(g));
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
