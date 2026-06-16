import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { emailChangeTokens } from '@/db/schema';
import type { DB } from '@/db/client';
import { generateRawToken, hashToken } from '@/lib/auth/tokens';

/** Confirmation links live 1 h, matching the password-reset window. */
export const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000;

const nowMs = () => Date.now();

export interface MintedEmailChange {
  /** Raw token to embed in the confirm URL. The DB only stores its hash. */
  token: string;
  expiresAt: Date;
}

/**
 * Mint and persist an email-change token for `newEmail`. Any earlier pending
 * tokens for the same user are invalidated first, so only the most recently
 * requested address can be confirmed (re-requesting with a corrected address
 * supersedes the typo'd one). Caller emails the raw `token` to `newEmail`.
 */
export async function mintEmailChange(
  db: DB,
  userId: string,
  newEmail: string,
): Promise<MintedEmailChange> {
  await invalidateOtherEmailChangesFor(db, userId);
  const token = generateRawToken();
  const expiresAt = new Date(nowMs() + EMAIL_CHANGE_TOKEN_TTL_MS);
  await db.insert(emailChangeTokens)
    .values({
      userId,
      newEmail,
      tokenHash: hashToken(token),
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

export interface EmailChangeLookup {
  id: string;
  userId: string;
  newEmail: string;
}

/** Resolve a raw token to its row iff active. Null when invalid/expired/used. */
export async function findValidEmailChange(
  db: DB,
  rawToken: string,
): Promise<EmailChangeLookup | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const row = (await db
    .select({
      id: emailChangeTokens.id,
      userId: emailChangeTokens.userId,
      newEmail: emailChangeTokens.newEmail,
      expiresAt: emailChangeTokens.expiresAt,
      consumedAt: emailChangeTokens.consumedAt,
    })
    .from(emailChangeTokens)
    .where(eq(emailChangeTokens.tokenHash, hashToken(rawToken)))
    .all())[0];
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() <= nowMs()) return null;
  return { id: row.id, userId: row.userId, newEmail: row.newEmail };
}

/**
 * Atomically mark the token consumed. Returns true when the row went from
 * unconsumed→consumed in this call. False if it was already used or expired.
 */
export async function consumeEmailChange(db: DB, rawToken: string): Promise<boolean> {
  if (!rawToken || typeof rawToken !== 'string') return false;
  const updated = await db
    .update(emailChangeTokens)
    .set({ consumedAt: new Date(nowMs()) })
    .where(
      and(
        eq(emailChangeTokens.tokenHash, hashToken(rawToken)),
        isNull(emailChangeTokens.consumedAt),
        sql`${emailChangeTokens.expiresAt} > ${nowMs()}`,
      ),
    )
    .returning({ id: emailChangeTokens.id })
    .all();
  return updated.length > 0;
}

/**
 * Best-effort cleanup — invalidates any other outstanding email-change tokens
 * for the same user, so confirming one (or requesting a fresh address) closes
 * any other in-flight links.
 */
export async function invalidateOtherEmailChangesFor(db: DB, userId: string): Promise<void> {
  await db.update(emailChangeTokens)
    .set({ consumedAt: new Date(nowMs()) })
    .where(
      and(
        eq(emailChangeTokens.userId, userId),
        isNull(emailChangeTokens.consumedAt),
      ),
    )
    .run();
}

/**
 * The address a user is currently waiting to confirm, if any — the newest
 * unconsumed, unexpired request. Used by Settings to show a "pending
 * confirmation" hint. Null when there's nothing outstanding.
 */
export async function getPendingEmailChange(db: DB, userId: string): Promise<string | null> {
  const row = (await db
    .select({ newEmail: emailChangeTokens.newEmail })
    .from(emailChangeTokens)
    .where(
      and(
        eq(emailChangeTokens.userId, userId),
        isNull(emailChangeTokens.consumedAt),
        sql`${emailChangeTokens.expiresAt} > ${nowMs()}`,
      ),
    )
    .orderBy(desc(emailChangeTokens.createdAt))
    .limit(1)
    .all())[0];
  return row?.newEmail ?? null;
}
