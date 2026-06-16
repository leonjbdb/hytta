'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { bookingWrites } from '@/server/booking/booking-client';
import { notifyBookingStatus } from '@/lib/email/notify';
import { BookingError } from '@/lib/booking/errors';
import { isDemoMode } from '@/lib/demo-mode';

export type RequestActionResult =
  | { ok: true }
  | { ok: false; code: 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'UNKNOWN'; message: string };

async function requireManager(): Promise<
  { ok: true; userId: string } | RequestActionResult
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };
  const row = (await getDb()
    .select({ isManager: users.isManager })
    .from(users)
    .where(eq(users.id, session.user.id))
    .all())[0];
  if (!row?.isManager) {
    return { ok: false, code: 'FORBIDDEN', message: 'Booking manager only' };
  }
  return { ok: true, userId: session.user.id };
}

function revalidateBookingViews() {
  revalidatePath('/dashboard');
  revalidatePath('/requests');
  revalidatePath('/book');
}

export async function approveBooking(bookingId: string): Promise<RequestActionResult> {
  const guard = await requireManager();
  if ('ok' in guard && !guard.ok) return guard;
  if (typeof bookingId !== 'string' || !bookingId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Missing booking id' };
  }
  try {
    const { rejectedIds } = await bookingWrites.approveBookingResolvingConflicts(bookingId);
    await notifyBookingStatus(bookingId, 'approved');
    // Conflicting requests are auto-rejected by the approval — tell their bookers.
    for (const id of rejectedIds) await notifyBookingStatus(id, 'rejected');
    revalidateBookingViews();
    return { ok: true };
  } catch (err) {
    if (isDemoMode() && !(err instanceof BookingError)) throw err;
    console.error('[requests] approve failed', err);
    return { ok: false, code: 'UNKNOWN', message: 'Approve failed' };
  }
}

export async function rejectBooking(bookingId: string): Promise<RequestActionResult> {
  const guard = await requireManager();
  if ('ok' in guard && !guard.ok) return guard;
  if (typeof bookingId !== 'string' || !bookingId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Missing booking id' };
  }
  try {
    await bookingWrites.rejectBooking(bookingId);
    await notifyBookingStatus(bookingId, 'rejected');
    revalidateBookingViews();
    return { ok: true };
  } catch (err) {
    if (isDemoMode() && !(err instanceof BookingError)) throw err;
    console.error('[requests] reject failed', err);
    return { ok: false, code: 'UNKNOWN', message: 'Reject failed' };
  }
}
