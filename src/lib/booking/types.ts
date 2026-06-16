import type { TargetKind, ReservationStatus, BedKind } from '@/db/schema';

export type ISODate = string & { readonly __isoDate: unique symbol };

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Discriminated union describing what a reservation targets. The shape mirrors
 * the polymorphic reservations table — exactly one identifier per kind.
 *   FULL_COTTAGE — every room and slot.
 *   ROOM         — entire room (all beds / all slots within it).
 *   BED          — a specific bed inside a BEDS-mode room.
 *   SLOT         — one slot in a SLOTS-mode room (anonymous).
 */
export type TargetSpec =
  | { kind: 'FULL_COTTAGE' }
  | { kind: 'ROOM'; roomId: string }
  | { kind: 'BED'; bedId: string }
  | { kind: 'SLOT'; roomId: string };

export interface Reservation {
  id: string;
  bookingId: string | null;
  bookerId: string | null;
  /** Registered participant. NULL when `guestName` is set. */
  userId: string | null;
  /** Free-form guest name. NULL when `userId` is set. */
  guestName: string | null;
  targetKind: TargetKind;
  roomId: string | null;
  bedId: string | null;
  /** Inclusive start of the stay. */
  startDate: string;
  /** Inclusive end of the stay. */
  endDate: string;
  status: ReservationStatus;
  createdAt: number;
}

export interface RoomDTO {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  capacityMode: 'BEDS' | 'SLOTS';
  slotCount: number | null;
}

export interface BedDTO {
  id: string;
  roomId: string;
  kind: BedKind;
  label: string;
}

/** A person occupying a target, with enough detail to render a PersonBadge and
 *  a "who and when" tooltip. */
export interface OccupantRef {
  /** The occupant's user id, or null for a guest. Lets the booking form hide
   *  people already booked over the range (they can't be added again). */
  userId: string | null;
  name: string;
  isGuest: boolean;
  isAdmin: boolean;
  isManager: boolean;
  /** The occupant's reservation range (ISO `YYYY-MM-DD`) — the "when". */
  startDate: string;
  endDate: string;
}

/**
 * Per-bed occupancy for BEDS-mode rooms. A bed is a small capacity unit: a
 * double sleeps two, a single one, and the seats can be shared across separate
 * bookings (it's a cottage for family + friends). `takenByOthers` is the PEAK
 * concurrent seats others hold on any single day in the range — so two
 * back-to-back stays don't both fill it, and a double with one occupant still
 * has a spare seat. A whole-room / whole-cottage hold fills every seat.
 */
export interface BedOccupancy {
  bedId: string;
  /** Seat capacity: a double sleeps two, a single one. */
  capacity: number;
  /** Peak concurrent seats held by OTHERS across the range. The bed is still
   *  bookable while `takenByOthers < capacity`. */
  takenByOthers: number;
  /** Who holds this bed (CONFIRMED). Drives the occupant badge(s). */
  takenBy: OccupantRef[];
  /** PENDING requests touching this bed — shown distinctly, do **not** block. */
  pending: number;
  /** Display names behind those pending requests (bed- and room-level). */
  pendingNames: string[];
}

export type AvailabilityTarget =
  | {
      kind: 'FULL_COTTAGE';
      /** True when no CONFIRMED reservation overlaps the range. */
      available: boolean;
      /** Pending requests overlapping — informational only, doesn't block. */
      pending: number;
      /** Display names behind pending whole-cottage requests. */
      pendingNames: string[];
    }
  | {
      kind: 'SLOT_ROOM';
      roomId: string;
      nameNb: string;
      nameEn: string;
      icon: string;
      color: string;
      capacity: number | null; // null = unlimited
      /** Slots already CONFIRMED — reduce remaining capacity. */
      taken: number;
      /** Who holds the CONFIRMED slots (SLOTS-mode rooms). Drives the person
       *  badges shown for occupants you can't edit. Empty for BEDS-mode rooms,
       *  whose occupants are surfaced per bed via `beds[].takenBy`. */
      takenBy: OccupantRef[];
      /** Slots requested but PENDING — shown distinctly, do **not** block. */
      pending: number;
      /** Display names behind pending requests touching this room (room- or
       *  bed-level). Powers the room's "awaiting approval" dot tooltip. */
      pendingNames: string[];
      /** Per-bed occupancy for BEDS-mode rooms; empty for SLOTS-mode rooms. */
      beds: BedOccupancy[];
    };
