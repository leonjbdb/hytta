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

/**
 * Per-bed occupancy for BEDS-mode rooms. A bed is reserved *whole* — a double
 * claimed by one person can't be back-filled by anyone else — so `taken` is a
 * boolean, not a seat count.
 */
export interface BedOccupancy {
  bedId: string;
  /** A CONFIRMED reservation occupies this bed (the bed itself, its room, or
   *  the whole cottage). When true the bed can't be picked. */
  taken: boolean;
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
      /** Slots requested but PENDING — shown distinctly, do **not** block. */
      pending: number;
      /** Display names behind pending requests touching this room (room- or
       *  bed-level). Powers the room's "awaiting approval" dot tooltip. */
      pendingNames: string[];
      /** Per-bed occupancy for BEDS-mode rooms; empty for SLOTS-mode rooms. */
      beds: BedOccupancy[];
    };
