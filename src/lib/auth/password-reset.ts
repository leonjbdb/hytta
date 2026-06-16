import { and, eq, isNull, sql } from 'drizzle-orm';
import { passwordResetTokens } from '@/db/schema';
import type { DB } from '@/db/client';
import { generateRawToken, hashToken } from '@/lib/auth/tokens';

// Re-exported so callers (and tests) that treat hashing as part of the
// password-reset surface keep working after the helper moved to `tokens.ts`.
export { hashToken } from '@/lib/auth/tokens';

/** Tokens live 1 h; tightens the residual blast radius if a link leaks. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const nowMs = () => Date.now();

export interface MintedReset {
  /** Raw token to embed in the reset URL. The DB only stores its hash. */
  token: string;
  expiresAt: Date;
}

/** Mint and persist a reset token. Caller emails the raw `token`. */
export async function mintPasswordReset(db: DB, userId: string): Promise<MintedReset> {
  const token = generateRawToken();
  const expiresAt = new Date(nowMs() + RESET_TOKEN_TTL_MS);
  await db.insert(passwordResetTokens)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

export interface ResetTokenLookup {
  id: string;
  userId: string;
}

/** Resolve a raw token to its row iff active. Null when invalid/expired/used. */
export async function findValidReset(db: DB, rawToken: string): Promise<ResetTokenLookup | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const row = (await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      consumedAt: passwordResetTokens.consumedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(rawToken)))
    .all())[0];
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() <= nowMs()) return null;
  return { id: row.id, userId: row.userId };
}

/**
 * Atomically mark the token consumed. Returns true when the row went from
 * unconsumed→consumed in this call. False if it was already used or expired.
 */
export async function consumePasswordReset(db: DB, rawToken: string): Promise<boolean> {
  if (!rawToken || typeof rawToken !== 'string') return false;
  const updated = await db
    .update(passwordResetTokens)
    .set({ consumedAt: new Date(nowMs()) })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(rawToken)),
        isNull(passwordResetTokens.consumedAt),
        sql`${passwordResetTokens.expiresAt} > ${nowMs()}`,
      ),
    )
    .returning({ id: passwordResetTokens.id })
    .all();
  return updated.length > 0;
}

/**
 * Best-effort cleanup — invalidates any other outstanding reset tokens for
 * the same user once one is consumed, so a successful reset closes any other
 * in-flight links.
 */
export async function invalidateOtherResetsFor(db: DB, userId: string): Promise<void> {
  await db.update(passwordResetTokens)
    .set({ consumedAt: new Date(nowMs()) })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.consumedAt),
      ),
    )
    .run();
}
