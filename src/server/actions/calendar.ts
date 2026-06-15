'use server';

import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { users } from '@/db/schema';

/**
 * Returns (and lazily generates) the signed-in user's iCal token.
 *
 * The token is a 32-byte random hex string stored on the user row. The
 * client builds feed URLs as
 *   `${origin}/api/calendar?token=<token>&scope=me|all`
 * — the origin lives on `window.location` so we don't have to read env
 * here. Rotating the column invalidates every existing subscription for
 * that user.
 */
export async function ensureCalendarToken(): Promise<
  | { ok: true; token: string }
  | { ok: false; code: 'AUTH'; message: string }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH', message: 'Sign in required' };
  }

  const row = (await db
    .select({ calendarToken: users.calendarToken })
    .from(users)
    .where(eq(users.id, session.user.id))
    .all())[0];

  if (row?.calendarToken) return { ok: true, token: row.calendarToken };

  const token = randomBytes(32).toString('hex');
  await db.update(users)
    .set({ calendarToken: token })
    .where(eq(users.id, session.user.id))
    .run();
  return { ok: true, token };
}
