'use server';

import { revalidatePath } from 'next/cache';
import { asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { bookingWrites } from '@/server/booking/booking-client';
import {
  notifyBookingCancelled,
  notifyBookingRequest,
  notifyReservationCancelled,
} from '@/lib/email/notify';
import {
  BookingError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/booking/errors';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: 'AUTH_REQUIRED' | 'CONFLICT' | 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'UNKNOWN';
      message: string;
      issues?: { path: string; message: string }[];
    };

function toError(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof ValidationError) {
    return { ok: false, code: 'VALIDATION', message: err.message, issues: err.issues };
  }
  if (err instanceof ConflictError) {
    return { ok: false, code: 'CONFLICT', message: err.message };
  }
  if (err instanceof NotFoundError) {
    return { ok: false, code: 'NOT_FOUND', message: err.message };
  }
  if (err instanceof ForbiddenError) {
    return { ok: false, code: 'FORBIDDEN', message: err.message };
  }
  if (err instanceof BookingError) {
    return { ok: false, code: 'UNKNOWN', message: err.message };
  }
  console.error('[reservations] unexpected error', err);
  return { ok: false, code: 'UNKNOWN', message: 'Something went wrong' };
}

function revalidateBookingViews() {
  revalidatePath('/dashboard', 'page');
  revalidatePath('/book', 'page');
}

export async function createBooking(
  raw: unknown,
): Promise<
  ActionResult<{
    bookingId: string;
    status: 'PENDING' | 'CONFIRMED';
    /**
     * Manager display names when the booking is PENDING. Empty when there
     * are zero or more than two managers — the UI falls back to a generic
     * "a booking manager" phrase. Capped at two so the success screen names
     * specific people in the small-family case but stays readable otherwise.
     */
    managerNames: string[];
  }>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Please sign in' };
  }
  try {
    const { bookingId, rows } = await bookingWrites.createBooking(
      session.user.id,
      raw,
    );
    revalidateBookingViews();
    const status =
      rows[0]?.status === 'PENDING' ? ('PENDING' as const) : ('CONFIRMED' as const);

    let managerNames: string[] = [];
    if (status === 'PENDING') {
      const managers = await getDb()
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.isManager, true))
        .all();
      if (managers.length === 1 || managers.length === 2) {
        managerNames = managers.map((m) => m.name ?? m.email);
      }
      await notifyBookingRequest(bookingId);
    }

    return { ok: true, data: { bookingId, status, managerNames } };
  } catch (err) {
    return toError(err);
  }
}

/**
 * Legacy single-target action. Retained so the existing booking client and
 * tests continue to compile during the multi-participant rollout. New UI uses
 * `createBooking` directly.
 */
export async function createReservation(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Please sign in' };
  }
  try {
    const r = await bookingWrites.create(session.user.id, raw);
    revalidateBookingViews();
    return { ok: true, data: { id: r.id } };
  } catch (err) {
    return toError(err);
  }
}

export async function cancelReservation(
  reservationId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Please sign in' };
  }
  if (typeof reservationId !== 'string' || reservationId.length === 0) {
    return { ok: false, code: 'VALIDATION', message: 'Missing reservation id' };
  }
  try {
    await bookingWrites.cancel(session.user.id, reservationId, {
      // Admins and managers may cancel anyone's individual stay.
      allowElevated: Boolean(session.user.isAdmin) || Boolean(session.user.isManager),
    });
    await notifyReservationCancelled(reservationId, session.user.id);
    revalidateBookingViews();
    return { ok: true, data: undefined };
  } catch (err) {
    return toError(err);
  }
}

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Please sign in' };
  }
  if (typeof bookingId !== 'string' || bookingId.length === 0) {
    return { ok: false, code: 'VALIDATION', message: 'Missing booking id' };
  }
  try {
    await bookingWrites.cancelBooking(session.user.id, bookingId, {
      // Admins and managers may cancel anyone's booking.
      allowElevated: Boolean(session.user.isAdmin) || Boolean(session.user.isManager),
    });
    await notifyBookingCancelled(bookingId, session.user.id);
    revalidateBookingViews();
    return { ok: true, data: undefined };
  } catch (err) {
    return toError(err);
  }
}

/**
 * Edit an existing booking in place — replaces its layout/dates. Only the
 * booking's owner may edit, unless the actor is an admin.
 */
export async function updateBooking(
  raw: { bookingId: string } & Record<string, unknown>,
): Promise<ActionResult<{ status: 'PENDING' | 'CONFIRMED'; managerNames: string[] }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Please sign in' };
  }
  const bookingId = raw?.bookingId;
  if (typeof bookingId !== 'string' || bookingId.length === 0) {
    return { ok: false, code: 'VALIDATION', message: 'Missing booking id' };
  }
  try {
    const { rows } = await bookingWrites.updateBooking(
      session.user.id,
      bookingId,
      raw,
      { allowAnyBooker: Boolean(session.user.isAdmin) },
    );
    revalidateBookingViews();
    const status =
      rows[0]?.status === 'PENDING' ? ('PENDING' as const) : ('CONFIRMED' as const);

    let managerNames: string[] = [];
    if (status === 'PENDING') {
      const managers = await getDb()
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.isManager, true))
        .all();
      if (managers.length === 1 || managers.length === 2) {
        managerNames = managers.map((m) => m.name ?? m.email);
      }
      await notifyBookingRequest(bookingId);
    }

    return { ok: true, data: { status, managerNames } };
  } catch (err) {
    return toError(err);
  }
}

/**
 * List users for the participant picker on the booking form. Returns name +
 * id only; email is intentionally not exposed to logged-in peers.
 */
export async function listUsersForPicker(): Promise<
  Array<{ id: string; name: string }>
> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const rows = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.name))
    .all();
  return rows.map((r) => ({ id: r.id, name: r.name ?? r.email }));
}
