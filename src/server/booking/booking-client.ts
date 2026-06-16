import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/client';
import { deserializeDomainError } from '@/lib/booking/errors';
import { ReservationService } from '@/lib/booking/reservation-service';
import type { BookingDO, DOResult } from './booking-do';

/**
 * Request-scoped service for READ-ONLY use (lists, lookups) in Next server
 * components and actions. All *mutations* go through `bookingWrites` (the DO) so
 * they serialise.
 */
export function readReservationService(): ReservationService {
  return new ReservationService(getDb());
}

/**
 * Server-side client for reservation *mutations*. Every call hops to the single
 * BookingDO instance so writes serialise (see booking-do.ts). The DO returns a
 * `DOResult`; we rebuild and throw the typed domain error on failure so callers
 * keep their existing `instanceof ConflictError` handling.
 *
 * Read-only queries do NOT go through here — use `readReservationService()`.
 */
function stub(): DurableObjectStub<BookingDO> {
  const { env } = getCloudflareContext();
  return env.BOOKING.get(env.BOOKING.idFromName('global'));
}

async function unwrap<T>(p: Promise<DOResult<T>>): Promise<T> {
  const result = await p;
  if (result.ok) return result.value;
  throw deserializeDomainError(result.error);
}

export const bookingWrites = {
  createBooking: (bookerId: string, raw: unknown) =>
    unwrap(stub().createBooking(bookerId, raw)),
  create: (userId: string, raw: unknown) => unwrap(stub().create(userId, raw)),
  updateBooking: (
    actorId: string,
    bookingId: string,
    raw: unknown,
    opts?: { allowAnyBooker?: boolean },
  ) => unwrap(stub().updateBooking(actorId, bookingId, raw, opts)),
  cancel: (actorId: string, reservationId: string, opts?: { allowElevated?: boolean }) =>
    unwrap(stub().cancel(actorId, reservationId, opts)),
  cancelBooking: (
    actorId: string,
    bookingId: string,
    opts?: { allowElevated?: boolean },
  ) => unwrap(stub().cancelBooking(actorId, bookingId, opts)),
  approveBooking: (bookingId: string) => unwrap(stub().approveBooking(bookingId)),
  approveBookingResolvingConflicts: (bookingId: string) =>
    unwrap(stub().approveBookingResolvingConflicts(bookingId)),
  rejectBooking: (bookingId: string) => unwrap(stub().rejectBooking(bookingId)),
};
