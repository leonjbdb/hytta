'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { headers, cookies } from 'next/headers';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { signIn } from '@/lib/auth/config';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/auth/rate-limit';
import {
  consumePasswordReset,
  findValidReset,
  invalidateOtherResetsFor,
  mintPasswordReset,
} from '@/lib/auth/password-reset';
import { mailer } from '@/lib/email/service';
import { requestOrigin } from '@/lib/origin';

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email().max(254));

const PasswordSchema = z.string().min(12).max(256);

const CONSTANT_TIME_FLOOR_MS = 200;

export type MagicLinkResult = { ok: true } | { ok: false; message: string };
export type CredentialsResult = { ok: true } | { ok: false; message: string };
export type ResetResult =
  | { ok: true }
  | { ok: false; code: 'VALIDATION' | 'TOKEN' | 'RATE_LIMIT'; message: string };

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

function constantTimeFloor(start: number): Promise<void> {
  const remaining = CONSTANT_TIME_FLOOR_MS - (Date.now() - start);
  return remaining > 0 ? new Promise((r) => setTimeout(r, remaining)) : Promise.resolve();
}

/**
 * Trigger an Auth.js magic-link email. Always returns `{ ok: true }` on a
 * well-formed email even when the address isn't a member, so callers can't
 * probe membership through the response. Real delivery is gated inside the
 * Nodemailer provider's `sendVerificationRequest` override.
 */
export async function requestMagicLink(formData: FormData): Promise<MagicLinkResult> {
  const start = Date.now();
  const parsed = EmailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    await constantTimeFloor(start);
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  const ip = await getIp();
  const limiter = rateLimit(`magic:${ip}`, 5, 60 * 60 * 1000);
  if (limiter.ok) {
    try {
      await signIn('nodemailer', {
        email: parsed.data,
        redirect: false,
        redirectTo: '/dashboard',
      });
    } catch (err) {
      // Don't leak Auth.js / SMTP failures to the user — log and fall through
      // so the response stays uniform.
      console.error('[auth] requestMagicLink failed', err);
    }
  }

  await constantTimeFloor(start);
  return { ok: true };
}

/**
 * DB-backed credentials login. Rate-limited per IP and per email so a thief
 * with a real address still hits a 5-attempt-per-15-min ceiling.
 */
export async function credentialsLogin(formData: FormData): Promise<CredentialsResult> {
  const emailParsed = EmailSchema.safeParse(formData.get('email'));
  const passwordParsed = z
    .string()
    .min(1)
    .max(256)
    .safeParse(formData.get('password'));
  if (!emailParsed.success || !passwordParsed.success) {
    return { ok: false, message: 'Invalid email or password.' };
  }

  const ip = await getIp();
  const window = 15 * 60 * 1000;
  const ipLimit = rateLimit(`creds:ip:${ip}`, 5, window);
  const emailLimit = rateLimit(`creds:email:${emailParsed.data}`, 5, window);
  if (!ipLimit.ok || !emailLimit.ok) {
    return { ok: false, message: 'Too many attempts. Try again later.' };
  }

  try {
    await signIn('credentials', {
      email: emailParsed.data,
      password: passwordParsed.data,
      redirect: false,
    });
    return { ok: true };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { ok: false, message: 'Invalid email or password.' };
  }
}

/**
 * Mint a password-reset token for the supplied email and email it. Always
 * returns `{ ok: true }` on a well-formed email so the response can't be
 * used to discover which addresses are registered.
 */
export async function requestPasswordReset(formData: FormData): Promise<MagicLinkResult> {
  const start = Date.now();
  const parsed = EmailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    await constantTimeFloor(start);
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  const ip = await getIp();
  const limiter = rateLimit(`reset:${ip}`, 5, 60 * 60 * 1000);
  if (limiter.ok) {
    const row = (await db
      .select({ id: users.id, isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.email, parsed.data))
      .all())[0];
    // Only admins use passwords; everyone else signs in with a magic link, so
    // there's nothing to reset for them.
    if (row?.isAdmin) {
      try {
        const minted = await mintPasswordReset(db, row.id);
        const url = `${await requestOrigin()}/reset-password/${minted.token}`;
        const locale = await getLocale();
        await mailer.sendResetPassword(parsed.data, url, locale, minted.expiresAt);
      } catch (err) {
        console.error('[auth] requestPasswordReset failed', err);
      }
    }
  }

  await constantTimeFloor(start);
  return { ok: true };
}

/**
 * Consume a reset token and set a new password. Atomic: the token is marked
 * consumed first; if that succeeds we update the hash and invalidate any
 * other pending tokens for the same user.
 */
export async function resetPassword(formData: FormData): Promise<ResetResult> {
  const token = String(formData.get('token') ?? '');
  const newPassword = formData.get('newPassword');
  const parsed = PasswordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Password must be at least 12 characters.',
    };
  }

  const ip = await getIp();
  const limiter = rateLimit(`reset-consume:${ip}`, 10, 60 * 60 * 1000);
  if (!limiter.ok) {
    return { ok: false, code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' };
  }

  const lookup = await findValidReset(db, token);
  if (!lookup) {
    return {
      ok: false,
      code: 'TOKEN',
      message: 'This reset link is invalid or has expired.',
    };
  }

  // Passwords are admin-only — never let a reset link mint one for a regular
  // account (defence in depth alongside requestPasswordReset).
  const target = (await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, lookup.userId))
    .all())[0];
  if (!target?.isAdmin) {
    return {
      ok: false,
      code: 'TOKEN',
      message: 'This reset link is invalid or has expired.',
    };
  }

  const consumed = await consumePasswordReset(db, token);
  if (!consumed) {
    return {
      ok: false,
      code: 'TOKEN',
      message: 'This reset link is invalid or has expired.',
    };
  }

  const hash = await hashPassword(parsed.data);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, lookup.userId)).run();
  await invalidateOtherResetsFor(db, lookup.userId);
  return { ok: true };
}
