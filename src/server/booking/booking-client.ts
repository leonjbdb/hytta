import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/client';
import { getDemoD1ForState } from '@/db/demo-d1';
import { drizzleFor } from '@/db/drizzle';
import { updateDemoState } from '@/db/demo-cache';
import { isDemoMode } from '@/lib/demo-mode';
import { deserializeDomainError } from '@/lib/booking/errors';
import { ReservationService } from '@/lib/booking/reservation-service';
import type { BookingDO, DOResult } from './booking-do';

/**
 * Request-scoped service for READ-ONLY use (lists, lookups) in Next server
 * components and actions. All *mutations* go through `bookingWrites` (the DO) so
 * they serialise.
 */
export function readReservationService(): ReservationService {
  return new ReservationService(getDb(), { demoMode: isDemoMode() });
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
  if (!env.BOOKING) {
    throw new Error(
      'Missing Cloudflare Durable Object binding BOOKING. Set DEMO=true or bind BookingDO.',
    );
  }
  return env.BOOKING.get(env.BOOKING.idFromName('global'));
}

async function unwrap<T>(p: Promise<DOResult<T>>): Promise<T> {
  const result = await p;
  if (result.ok) return result.value;
  throw deserializeDomainError(result.error);
}

function demoWrite<T>(work: (service: ReservationService) => Promise<T>): Promise<T> {
  return updateDemoState((state) =>
    work(new ReservationService(drizzleFor(getDemoD1ForState(state)), { demoMode: true })),
  );
}

export const bookingWrites = {
  createBooking: (bookerId: string, raw: unknown) =>
    isDemoMode()
      ? demoWrite((service) => service.createBooking(bookerId, raw))
      : unwrap(stub().createBooking(bookerId, raw)),
  create: (userId: string, raw: unknown) =>
    isDemoMode()
      ? demoWrite((service) => service.create(userId, raw))
      : unwrap(stub().create(userId, raw)),
  updateBooking: (
    actorId: string,
    bookingId: string,
    raw: unknown,
    opts?: { allowAnyBooker?: boolean },
  ) =>
    isDemoMode()
      ? demoWrite((service) => service.updateBooking(actorId, bookingId, raw, opts))
      : unwrap(stub().updateBooking(actorId, bookingId, raw, opts)),
  cancel: (actorId: string, reservationId: string, opts?: { allowElevated?: boolean }) =>
    isDemoMode()
      ? demoWrite((service) => service.cancel(actorId, reservationId, opts))
      : unwrap(stub().cancel(actorId, reservationId, opts)),
  cancelBooking: (
    actorId: string,
    bookingId: string,
    opts?: { allowElevated?: boolean },
  ) =>
    isDemoMode()
      ? demoWrite((service) => service.cancelBooking(actorId, bookingId, opts))
      : unwrap(stub().cancelBooking(actorId, bookingId, opts)),
  approveBooking: (bookingId: string) =>
    isDemoMode()
      ? demoWrite((service) => service.approveBooking(bookingId))
      : unwrap(stub().approveBooking(bookingId)),
  approveBookingResolvingConflicts: (bookingId: string) =>
    isDemoMode()
      ? demoWrite((service) => service.approveBookingResolvingConflicts(bookingId))
      : unwrap(stub().approveBookingResolvingConflicts(bookingId)),
  rejectBooking: (bookingId: string) =>
    isDemoMode()
      ? demoWrite((service) => service.rejectBooking(bookingId))
      : unwrap(stub().rejectBooking(bookingId)),
};
