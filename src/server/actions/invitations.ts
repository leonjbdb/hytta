'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { headers, cookies } from 'next/headers';
import { auth, signIn } from '@/lib/auth/config';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { DEMO_PASSWORD } from '@/lib/demo-constants';
import { isDemoMode } from '@/lib/demo-mode';
import { rateLimit } from '@/lib/auth/rate-limit';
import { hashPassword } from '@/lib/auth/password';
import { mailer } from '@/lib/email/service';
import { requestOrigin } from '@/lib/origin';
import { cottageNameOrApp } from '@/lib/cottage';
import {
  INVITE_MAX_DURATION_HOURS,
  INVITE_MIN_DURATION_HOURS,
  type InvitationRow,
  adminRevokeInvitation as libAdminRevoke,
  consumeInvitation as libConsume,
  createInvitation as libCreate,
  findValidInvitation as libFindValid,
  listUserInvitations as libList,
  revokeInvitation as libRevoke,
  userCanInvite as libCanInvite,
} from '@/lib/auth/invitations';

const CONSTANT_TIME_FLOOR_MS = 200;

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

export type InviteCreateResult =
  | { ok: true; invitation: InvitationRow; emailed: boolean }
  | { ok: false; code: 'AUTH' | 'FORBIDDEN' | 'VALIDATION' | 'RATE_LIMIT' | 'TAKEN'; message: string };

export type InviteRevokeResult =
  | { ok: true }
  | { ok: false; code: 'AUTH' | 'NOT_FOUND'; message: string };

export type InviteAcceptResult =
  | { ok: true; signedIn?: boolean }
  | { ok: false; code: 'TOKEN' | 'VALIDATION' | 'TAKEN' | 'RATE_LIMIT' | 'EMAIL'; message: string };

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email().max(254));

const CreateInviteSchema = z
  .object({
    maxUses: z.union([z.literal(1), z.null()]),
    durationHours: z
      .number()
      .int()
      .min(INVITE_MIN_DURATION_HOURS)
      .max(INVITE_MAX_DURATION_HOURS),
    email: z.string().optional().nullable(),
  })
  .transform((v) => ({
    ...v,
    email: v.email && v.email.trim().length > 0 ? v.email.trim().toLowerCase() : null,
  }))
  .refine((v) => v.email === null || EmailSchema.safeParse(v.email).success, {
    path: ['email'],
    message: 'Invalid email',
  });

const AcceptInviteSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'Invalid token shape'),
  email: z.string().trim().toLowerCase().optional(),
});

/**
 * Mint a new invite for the signed-in user.
 *
 * Two flavours:
 * - Shareable link (`email` omitted): the recipient supplies the email they
 *   will use to sign in. `maxUses` is the caller's choice.
 * - Direct email (`email` present): the recipient is pre-bound; we email the
 *   link and force `maxUses = 1` so a forwarded link can't enrol someone else.
 */
export async function createInvite(input: unknown): Promise<InviteCreateResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH', message: 'Sign in required' };
  }
  if (!(await libCanInvite(db, session.user.id))) {
    return { ok: false, code: 'FORBIDDEN', message: 'You cannot create invites' };
  }

  const limiter = rateLimit(`invite-create:${session.user.id}`, 10, 60 * 60 * 1000);
  if (!limiter.ok) {
    return { ok: false, code: 'RATE_LIMIT', message: 'Too many invites; try again later.' };
  }

  const parsed = CreateInviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const email = parsed.data.email;
  if (isDemoMode() && email) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Email invitations are disabled in demo mode. Create a shareable link instead.',
    };
  }

  if (email) {
    const taken = (await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .all())[0];
    if (taken) {
      return {
        ok: false,
        code: 'TAKEN',
        message: 'That email already has an account.',
      };
    }
  }

  const invitation = await libCreate(db, {
    createdBy: session.user.id,
    // Email-bound invites are always single-use.
    maxUses: email ? 1 : parsed.data.maxUses,
    durationHours: parsed.data.durationHours,
    email,
  });

  let emailed = false;
  if (email) {
    try {
      const inviter = (await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, session.user.id))
        .all())[0];
      const fromName = inviter?.name ?? inviter?.email ?? (await cottageNameOrApp());
      const url = `${await requestOrigin()}/invite/${invitation.token}`;
      const locale = await getLocale();
      await mailer.sendInvite(email, url, fromName, locale, invitation.expiresAt);
      emailed = true;
    } catch (err) {
      console.error('[invite] sendInvite failed', err);
      // Surface failure rather than leaving a silent ghost invite.
      await libRevoke(db, invitation.id, session.user.id);
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'Could not send the invitation email. Try again.',
      };
    }
  }

  revalidatePath('/invite');
  return { ok: true, invitation, emailed };
}

/** Revoke an invite. Creator-only path; admins use admin.ts → setUserInvitee  + admin revoke route. */
export async function revokeInvite(id: string): Promise<InviteRevokeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH', message: 'Sign in required' };
  }
  if (typeof id !== 'string' || !id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Missing invite id' };
  }

  // Admins can revoke anyone's invite; everyone else only their own.
  const ok = session.user.isAdmin
    ? await libAdminRevoke(db, id)
    : await libRevoke(db, id, session.user.id);
  if (!ok) return { ok: false, code: 'NOT_FOUND', message: 'Invite not found' };
  revalidatePath('/invite');
  revalidatePath('/admin');
  return { ok: true };
}

export async function listMyInvites(): Promise<InvitationRow[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return await libList(db, session.user.id);
}

/**
 * Accept an invite — public action. Validates the token, atomically consumes
 * one use, creates a new user, and triggers a magic-link email so the new
 * member must demonstrate control of the address before being signed in.
 *
 * If the invite is email-bound, the address is fixed by the row and the form
 * value is ignored. Display name and notification preferences are collected
 * after the recipient signs in for the first time.
 *
 * Generic error messages throughout to avoid leaking which invites are valid
 * vs. which emails are already taken.
 */
export async function acceptInvite(formData: FormData): Promise<InviteAcceptResult> {
  const start = Date.now();
  const ip = await getIp();
  const limiter = rateLimit(`invite-accept:${ip}`, 10, 60 * 60 * 1000);
  if (!limiter.ok) {
    await constantTimeFloor(start);
    return {
      ok: false,
      code: 'RATE_LIMIT',
      message: 'Too many attempts. Try again later.',
    };
  }

  const parsed = AcceptInviteSchema.safeParse({
    token: formData.get('token'),
    email: formData.get('email') ?? undefined,
  });
  if (!parsed.success) {
    await constantTimeFloor(start);
    return {
      ok: false,
      code: 'VALIDATION',
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const valid = await libFindValid(db, parsed.data.token);
  if (!valid) {
    await constantTimeFloor(start);
    return { ok: false, code: 'TOKEN', message: 'This invitation is invalid or expired.' };
  }

  // Resolve the email: bound invites use the invitation row; otherwise the
  // recipient supplied one through the form.
  let email: string;
  if (valid.email) {
    email = valid.email;
  } else {
    const formEmail = parsed.data.email;
    const emailParsed = EmailSchema.safeParse(formEmail);
    if (!emailParsed.success) {
      await constantTimeFloor(start);
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'Please enter a valid email address.',
      };
    }
    email = emailParsed.data;
  }

  // If the email is already a member, refuse without consuming the invite —
  // generic error so we don't reveal that the address is taken.
  const existing = (await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .all())[0];
  if (existing) {
    await constantTimeFloor(start);
    return {
      ok: false,
      code: 'TAKEN',
      message: 'This invitation is invalid or expired.',
    };
  }

  const consumed = await libConsume(db, parsed.data.token);
  if (!consumed) {
    await constantTimeFloor(start);
    return { ok: false, code: 'TOKEN', message: 'This invitation is invalid or expired.' };
  }

  // Create the user with the invitee flag so they can extend the chain. In
  // demo mode the account is password-backed and verified immediately because
  // there is no email delivery.
  await db.insert(users)
    .values({
      email,
      isInvitee: true,
      passwordHash: isDemoMode() ? await hashPassword(DEMO_PASSWORD) : null,
      emailVerified: isDemoMode() ? new Date() : null,
    })
    .run();

  if (isDemoMode()) {
    await signIn('credentials', {
      email,
      password: DEMO_PASSWORD,
      redirect: false,
      redirectTo: '/dashboard',
    });
    await constantTimeFloor(start);
    return { ok: true, signedIn: true };
  }

  try {
    await signIn('nodemailer', {
      email,
      redirect: false,
      redirectTo: '/dashboard',
    });
  } catch (err) {
    console.error('[invite] post-accept magic link failed', err);
    await constantTimeFloor(start);
    return {
      ok: false,
      code: 'EMAIL',
      message: 'Could not send the sign-in email. Try again.',
    };
  }

  await constantTimeFloor(start);
  return { ok: true };
}
