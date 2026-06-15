import 'server-only';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { reservations, users } from '@/db/schema';
import { mailer } from './service';
import type { BookingStatus, Role } from './templates';

/**
 * Notification dispatch — the one place that knows the preference rules and
 * turns a domain event into emails. Every function is best-effort: it swallows
 * its own errors and logs, so a mail hiccup never fails the booking/admin
 * action that triggered it.
 *
 * Recipients are never the actor, so we don't have their locale cookie — and
 * the emails are bilingual anyway. We default the "primary" (first-shown)
 * language to Norwegian, matching the app default.
 */
const NOTIFY_LOCALE = 'nb-NO' as const;

interface BookingMeta {
  bookerId: string | null;
  startDate: string;
  endDate: string;
}

async function bookingMeta(bookingId: string): Promise<BookingMeta | null> {
  return (
    (await db
      .select({
        bookerId: reservations.bookerId,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
      })
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all())[0] ?? null
  );
}

/** Email the booker about a status change, honouring their booking-email pref. */
async function sendStatusToBooker(
  bookerId: string,
  startDate: string,
  endDate: string,
  kind: BookingStatus,
): Promise<void> {
  const booker = (await db
    .select({
      email: users.email,
      notifyEnabled: users.notifyEnabled,
      notifyBooking: users.notifyBooking,
    })
    .from(users)
    .where(eq(users.id, bookerId))
    .all())[0];
  if (!booker?.email || !booker.notifyEnabled || !booker.notifyBooking) return;
  await mailer.sendBookingStatus(booker.email, kind, startDate, endDate, NOTIFY_LOCALE);
}

/** Booking approved/rejected — notify the booker. */
export async function notifyBookingStatus(
  bookingId: string,
  kind: Extract<BookingStatus, 'approved' | 'rejected'>,
): Promise<void> {
  try {
    const meta = await bookingMeta(bookingId);
    if (!meta?.bookerId) return;
    await sendStatusToBooker(meta.bookerId, meta.startDate, meta.endDate, kind);
  } catch (err) {
    console.error('[notify] booking status failed', err);
  }
}

/** Whole booking cancelled by someone other than its owner — notify the owner. */
export async function notifyBookingCancelled(
  bookingId: string,
  actorId: string,
): Promise<void> {
  try {
    const meta = await bookingMeta(bookingId);
    if (!meta?.bookerId || meta.bookerId === actorId) return;
    await sendStatusToBooker(meta.bookerId, meta.startDate, meta.endDate, 'cancelled');
  } catch (err) {
    console.error('[notify] booking cancel failed', err);
  }
}

/** A single stay cancelled by someone other than the booking's owner. */
export async function notifyReservationCancelled(
  reservationId: string,
  actorId: string,
): Promise<void> {
  try {
    const row = (await db
      .select({
        bookerId: reservations.bookerId,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .all())[0];
    if (!row?.bookerId || row.bookerId === actorId) return;
    await sendStatusToBooker(row.bookerId, row.startDate, row.endDate, 'cancelled');
  } catch (err) {
    console.error('[notify] reservation cancel failed', err);
  }
}

/** A new booking is awaiting approval — notify managers who opted in. */
export async function notifyBookingRequest(bookingId: string): Promise<void> {
  try {
    const meta = await bookingMeta(bookingId);
    if (!meta) return;
    const booker = meta.bookerId
      ? (await db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, meta.bookerId))
          .all())[0]
      : undefined;
    const bookerName = booker?.name ?? booker?.email ?? 'Someone';
    // Don't email the booker even if they're a manager who opted in.
    const conditions = [
      eq(users.isManager, true),
      eq(users.notifyEnabled, true),
      eq(users.notifyRequests, true),
    ];
    if (meta.bookerId) conditions.push(ne(users.id, meta.bookerId));
    const managers = await db
      .select({ email: users.email })
      .from(users)
      .where(and(...conditions))
      .all();
    await Promise.allSettled(
      managers
        .filter((m): m is { email: string } => Boolean(m.email))
        .map((m) =>
          mailer.sendBookingRequest(
            m.email,
            bookerName,
            meta.startDate,
            meta.endDate,
            NOTIFY_LOCALE,
          ),
        ),
    );
  } catch (err) {
    console.error('[notify] booking request failed', err);
  }
}

/** Promoted/demoted to/from admin or manager — notify the affected user. */
export async function notifyRoleChanged(
  userId: string,
  role: Role,
  granted: boolean,
): Promise<void> {
  try {
    const u = (await db
      .select({ email: users.email, notifyEnabled: users.notifyEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .all())[0];
    if (!u?.email || !u.notifyEnabled) return;
    await mailer.sendRoleChanged(u.email, role, granted, NOTIFY_LOCALE);
  } catch (err) {
    console.error('[notify] role change failed', err);
  }
}
