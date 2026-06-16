'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { auth, signOut } from '@/lib/auth/config';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/auth/rate-limit';
import {
  consumeEmailChange,
  findValidEmailChange,
  invalidateOtherEmailChangesFor,
  mintEmailChange,
} from '@/lib/auth/email-change';
import { isDemoMode } from '@/lib/demo-mode';
import { mailer } from '@/lib/email/service';
import { requestOrigin } from '@/lib/origin';
import { composeName } from '@/lib/name';

export type UserActionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'AUTH'
        | 'FORBIDDEN'
        | 'VALIDATION'
        | 'CURRENT'
        | 'RATE_LIMIT'
        | 'CONFLICT'
        | 'TOKEN';
      message: string;
    };

/** Normalised email: trimmed, lower-cased, validated, length-capped. */
const EmailSchema = z.string().trim().toLowerCase().pipe(z.string().email().max(254));

async function getIp(): Promise<string> {
  const h = await headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'local'
  );
}

async function getLocale(): Promise<'en-GB' | 'nb-NO'> {
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
  return cookieLocale === 'en-GB' ? 'en-GB' : 'nb-NO';
}

const NameSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
});

const NotifySchema = z.object({
  enabled: z.boolean(),
  booking: z.boolean(),
  requests: z.boolean(),
});

const FirstLoginSchema = NameSchema.extend({
  notifyEnabled: z.boolean(),
  notifyBooking: z.boolean(),
  notifyRequests: z.boolean(),
});

export interface FirstLoginInput {
  firstName: string;
  lastName: string;
  notifyEnabled: boolean;
  notifyBooking: boolean;
  notifyRequests: boolean;
}

/**
 * Save the signed-in user's email-notification preferences. The sub-flags are
 * always stored (even while the master switch is off) so toggling it back on
 * restores the user's earlier choices.
 */
export async function updateNotificationPrefs(
  input: { enabled: boolean; booking: boolean; requests: boolean },
): Promise<UserActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };

  const parsed = NotifySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION', message: 'Invalid preferences' };
  }

  await db.update(users)
    .set({
      notifyEnabled: parsed.data.enabled,
      notifyBooking: parsed.data.booking,
      notifyRequests: parsed.data.requests,
    })
    .where(eq(users.id, session.user.id))
    .run();
  revalidatePath('/settings');
  return { ok: true };
}

export async function updateName(formData: FormData): Promise<UserActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };

  const parsed = NameSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid name' };
  }

  const { firstName, lastName } = parsed.data;
  await db.update(users)
    .set({ firstName, lastName, name: composeName(firstName, lastName) })
    .where(eq(users.id, session.user.id))
    .run();
  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * Step one of a verified email change: validate the requested address and
 * email a confirmation link to it. The account's `email` is NOT touched here —
 * because login is magic-link based, the address only swaps once the member
 * proves they control the new inbox by clicking the link (see
 * `confirmEmailChange`). Until then the old address keeps working.
 *
 * Unlike the public auth flows we don't hide whether the target is taken: this
 * runs for an authenticated member of a closed cottage who can already see
 * fellow members, so a clear "already in use" beats a confusing late failure.
 */
export async function requestEmailChange(formData: FormData): Promise<UserActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };
  if (isDemoMode()) {
    return { ok: false, code: 'FORBIDDEN', message: 'Email changes are disabled in demo mode.' };
  }

  const parsed = EmailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION', message: 'Please enter a valid email address.' };
  }
  const newEmail = parsed.data;

  const limiter = rateLimit(`email-change:${session.user.id}`, 5, 60 * 60 * 1000);
  if (!limiter.ok) {
    return { ok: false, code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' };
  }

  const me = (await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .all())[0];
  if (!me) return { ok: false, code: 'AUTH', message: 'Sign in required' };
  if (me.email.toLowerCase() === newEmail) {
    return { ok: false, code: 'VALIDATION', message: 'That is already your email address.' };
  }

  const taken = (await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .all())[0];
  if (taken) {
    return { ok: false, code: 'CONFLICT', message: 'That email address is already in use.' };
  }

  try {
    const minted = await mintEmailChange(db, session.user.id, newEmail);
    const url = `${await requestOrigin()}/confirm-email/${minted.token}`;
    await mailer.sendEmailChange(newEmail, url, await getLocale(), minted.expiresAt);
  } catch (err) {
    console.error('[user] requestEmailChange failed', err);
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Could not send the confirmation email. Try again.',
    };
  }

  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Step two: consume the token (sent to and clicked from the NEW address) and
 * swap the account's email. Intentionally usable without an active session —
 * the link may be opened in the new inbox on a different device; possession of
 * the single-use, hashed, 1 h token is the authorisation. On success we mark
 * the address verified (they just proved control of it) and send a heads-up to
 * the OLD address so a session-hijack swap can't go silently unnoticed.
 */
export async function confirmEmailChange(formData: FormData): Promise<UserActionResult> {
  if (isDemoMode()) {
    return { ok: false, code: 'FORBIDDEN', message: 'Email changes are disabled in demo mode.' };
  }
  const token = String(formData.get('token') ?? '');

  const limiter = rateLimit(`email-change-consume:${await getIp()}`, 10, 60 * 60 * 1000);
  if (!limiter.ok) {
    return { ok: false, code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' };
  }

  const lookup = await findValidEmailChange(db, token);
  if (!lookup) {
    return { ok: false, code: 'TOKEN', message: 'This confirmation link is invalid or has expired.' };
  }

  // Another account may have claimed this address since the link was minted.
  const taken = (await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, lookup.newEmail), ne(users.id, lookup.userId)))
    .all())[0];
  if (taken) {
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'That email address is now in use. Request the change again.',
    };
  }

  // Capture the old address before the swap so we can notify it afterwards.
  const current = (await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, lookup.userId))
    .all())[0];

  const consumed = await consumeEmailChange(db, token);
  if (!consumed) {
    return { ok: false, code: 'TOKEN', message: 'This confirmation link is invalid or has expired.' };
  }

  try {
    await db.update(users)
      .set({ email: lookup.newEmail, emailVerified: new Date() })
      .where(eq(users.id, lookup.userId))
      .run();
  } catch (err) {
    // The unique constraint is the real guard against a check→update race.
    console.error('[user] confirmEmailChange update failed', err);
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'That email address is now in use. Request the change again.',
    };
  }
  await invalidateOtherEmailChangesFor(db, lookup.userId);

  // Best-effort security notice to the old address — never block the change on it.
  if (current?.email && current.email.toLowerCase() !== lookup.newEmail.toLowerCase()) {
    try {
      await mailer.sendEmailChangedNotice(current.email, lookup.newEmail, await getLocale());
    } catch (err) {
      console.error('[user] sendEmailChangedNotice failed', err);
    }
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function completeFirstLogin(input: FirstLoginInput): Promise<UserActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };

  const parsed = FirstLoginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: parsed.error.issues[0]?.message ?? 'Invalid first-login setup',
    };
  }

  const { firstName, lastName, notifyEnabled, notifyBooking, notifyRequests } = parsed.data;
  await db.update(users)
    .set({
      firstName,
      lastName,
      name: composeName(firstName, lastName),
      notifyEnabled,
      notifyBooking,
      notifyRequests,
      firstLoginCompletedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(users.id, session.user.id))
    .run();

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().max(256).optional(),
    newPassword: z.string().min(12).max(256),
    confirmPassword: z.string().max(256),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'New passwords do not match.',
  });

/**
 * Set or change the signed-in user's password.
 *
 * - When the user already has a password hash, `currentPassword` is required
 *   and must verify, so a stolen session can't silently rotate the password
 *   out from under the legitimate owner.
 * - When the user has no password hash (magic-link-only account), we accept
 *   the new password without a current-password challenge — they're already
 *   authenticated by Auth.js and there's no existing secret to compare to.
 */
export async function changePassword(formData: FormData): Promise<UserActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };
  // Passwords are admin-only; everyone else signs in with a magic link.
  if (!session.user.isAdmin) {
    return { ok: false, code: 'FORBIDDEN', message: 'Only admins can set a password.' };
  }

  const limiter = rateLimit(`change-password:${session.user.id}`, 10, 15 * 60 * 1000);
  if (!limiter.ok) {
    return { ok: false, code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' };
  }

  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword') ?? undefined,
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const me = (await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.user.id))
    .all())[0];
  if (!me) return { ok: false, code: 'AUTH', message: 'Sign in required' };

  if (me.passwordHash) {
    if (!parsed.data.currentPassword) {
      return {
        ok: false,
        code: 'CURRENT',
        message: 'Current password is required.',
      };
    }
    const ok = await verifyPassword(me.passwordHash, parsed.data.currentPassword);
    if (!ok) {
      return { ok: false, code: 'CURRENT', message: 'Current password is incorrect.' };
    }
  }

  const hash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, session.user.id)).run();
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Delete the signed-in user's own account. FK cascades clear their sessions,
 * bookings, group memberships, invites and dugnad authorship (see schema
 * `onDelete` rules), then we sign them out and send them to the login page.
 *
 * Blocked for the last remaining admin — deleting them would leave the cottage
 * unmanageable. They must hand admin to someone else first.
 */
export async function deleteOwnAccount(): Promise<UserActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };

  if (session.user.isAdmin) {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).all();
    if (admins.length <= 1) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: 'You are the last admin — make someone else an admin before deleting your account.',
      };
    }
  }

  await db.delete(users).where(eq(users.id, session.user.id)).run();
  // Clears the session cookie and redirects — the call below throws the
  // redirect, so nothing after it runs on success.
  await signOut({ redirectTo: '/login' });
  return { ok: true };
}
