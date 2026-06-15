'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { auth, signOut } from '@/lib/auth/config';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/auth/rate-limit';
import { composeName } from '@/lib/name';

export type UserActionResult =
  | { ok: true }
  | {
      ok: false;
      code: 'AUTH' | 'FORBIDDEN' | 'VALIDATION' | 'CURRENT' | 'RATE_LIMIT';
      message: string;
    };

const NameSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
});

const NotifySchema = z.object({
  enabled: z.boolean(),
  booking: z.boolean(),
  requests: z.boolean(),
});

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
