import { DurableObject } from 'cloudflare:workers';
import { drizzleFor } from '@/db/drizzle';
import { ReservationService } from '@/lib/booking/reservation-service';
import { serializeDomainError, type DomainErrorPayload } from '@/lib/booking/errors';
import type { Reservation } from '@/lib/booking/types';

/**
 * Result envelope crossing the RPC boundary. Typed domain errors (ConflictError
 * etc.) don't survive structured clone, so the DO returns a plain payload and
 * the client rebuilds the error — see `booking-client.ts`.
 */
export type DOResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainErrorPayload };

type BookingRows = { bookingId: string; rows: Reservation[] };

/**
 * The single writer for reservations.
 *
 * D1 has no interactive transactions, so we can't take a `BEGIN IMMEDIATE`
 * lock around check-then-insert. Instead, every mutating call is funnelled
 * through one DO instance (`idFromName('global')`) and serialised on an
 * internal promise chain: a booking's conflict checks and its atomic
 * `db.batch()` write run to completion before the next writer starts. As long
 * as ALL reservation mutations go through here, two overlapping bookings can
 * never both pass their conflict check.
 */
export class BookingDO extends DurableObject<CloudflareEnv> {
  private readonly svc: ReservationService;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.svc = new ReservationService(drizzleFor(env.DB));
  }

  /** Queue `fn` behind any in-flight mutation; never rejects (errors are boxed). */
  private serialize<T>(fn: () => Promise<T>): Promise<DOResult<T>> {
    const run = this.chain.then(async (): Promise<DOResult<T>> => {
      try {
        return { ok: true, value: await fn() };
      } catch (err) {
        return { ok: false, error: serializeDomainError(err) };
      }
    });
    // Keep the chain alive regardless of this op's outcome.
    this.chain = run.catch(() => {});
    return run;
  }

  createBooking(bookerId: string, raw: unknown): Promise<DOResult<BookingRows>> {
    return this.serialize(() => this.svc.createBooking(bookerId, raw));
  }

  create(userId: string, raw: unknown): Promise<DOResult<Reservation>> {
    return this.serialize(() => this.svc.create(userId, raw));
  }

  updateBooking(
    actorId: string,
    bookingId: string,
    raw: unknown,
    opts?: { allowAnyBooker?: boolean },
  ): Promise<DOResult<BookingRows>> {
    return this.serialize(() => this.svc.updateBooking(actorId, bookingId, raw, opts));
  }

  cancel(
    actorId: string,
    reservationId: string,
    opts?: { allowElevated?: boolean },
  ): Promise<DOResult<void>> {
    return this.serialize(() => this.svc.cancel(actorId, reservationId, opts));
  }

  cancelBooking(
    actorId: string,
    bookingId: string,
    opts?: { allowElevated?: boolean },
  ): Promise<DOResult<void>> {
    return this.serialize(() => this.svc.cancelBooking(actorId, bookingId, opts));
  }

  approveBooking(bookingId: string): Promise<DOResult<void>> {
    return this.serialize(() => this.svc.approveBooking(bookingId));
  }

  approveBookingResolvingConflicts(
    bookingId: string,
  ): Promise<DOResult<{ rejectedIds: string[] }>> {
    return this.serialize(() => this.svc.approveBookingResolvingConflicts(bookingId));
  }

  rejectBooking(bookingId: string): Promise<DOResult<void>> {
    return this.serialize(() => this.svc.rejectBooking(bookingId));
  }
}
