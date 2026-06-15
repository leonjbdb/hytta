import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { invitations, users } from '@/db/schema';
import type { DB } from '@/db/client';

/** ISO-millis timestamp of "now". */
const nowMs = () => Date.now();

export const INVITE_MIN_DURATION_HOURS = 24;
export const INVITE_MAX_DURATION_HOURS = 168;
export const INVITE_DEFAULT_DURATION_HOURS = 24;

export interface InvitationRow {
  id: string;
  token: string;
  createdBy: string;
  maxUses: number | null;
  useCount: number;
  /**
   * When set, the invite was sent directly to this address. The accept page
   * skips the email field and uses this value, preventing the recipient from
   * substituting a different address. Null = shareable link.
   */
  email: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: number;
}

/** 256-bit URL-safe token (43 chars, no padding). */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreateInvitationOpts {
  createdBy: string;
  /** `1` = single use; `null` = unlimited multi-use. */
  maxUses: 1 | null;
  /** TTL in hours, clamped to [INVITE_MIN_DURATION_HOURS, INVITE_MAX_DURATION_HOURS]. */
  durationHours: number;
  /** Optional pre-bound recipient. Null = shareable link. */
  email?: string | null;
}

export async function createInvitation(db: DB, opts: CreateInvitationOpts): Promise<InvitationRow> {
  const hours = Math.max(
    INVITE_MIN_DURATION_HOURS,
    Math.min(INVITE_MAX_DURATION_HOURS, Math.floor(opts.durationHours)),
  );
  const expiresAt = new Date(nowMs() + hours * 60 * 60 * 1000);
  const token = generateInviteToken();
  const inserted = (await db
    .insert(invitations)
    .values({
      token,
      createdBy: opts.createdBy,
      maxUses: opts.maxUses,
      email: opts.email ?? null,
      expiresAt,
    })
    .returning()
    .all())[0]!;
  return inserted;
}

/** Returns the row only if it exists, isn't revoked/expired, and has uses left. */
export async function findValidInvitation(db: DB, token: string): Promise<InvitationRow | null> {
  if (!token || typeof token !== 'string') return null;
  const row = (await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token))
    .all())[0];
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= nowMs()) return null;
  if (row.maxUses != null && row.useCount >= row.maxUses) return null;
  return row;
}

/**
 * Atomically increment `useCount`, refusing if the invite is revoked, expired,
 * or already at its cap. Returns true exactly when the increment landed —
 * concurrent callers cannot both see `true` for a single-use invite.
 */
export async function consumeInvitation(db: DB, token: string): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const updated = await db
    .update(invitations)
    .set({ useCount: sql`${invitations.useCount} + 1` })
    .where(
      and(
        eq(invitations.token, token),
        isNull(invitations.revokedAt),
        sql`${invitations.expiresAt} > ${nowMs()}`,
        or(
          isNull(invitations.maxUses),
          sql`${invitations.useCount} < ${invitations.maxUses}`,
        ),
      ),
    )
    .returning({ id: invitations.id })
    .all();
  return updated.length > 0;
}

export async function listUserInvitations(db: DB, userId: string): Promise<InvitationRow[]> {
  return await db
    .select()
    .from(invitations)
    .where(eq(invitations.createdBy, userId))
    .orderBy(desc(invitations.createdAt))
    .all();
}

/**
 * Revoke a still-active invite. Allowed for the original creator only — admins
 * use `adminRevokeInvitation` so the privilege check stays at the call site.
 */
export async function revokeInvitation(db: DB, id: string, byUserId: string): Promise<boolean> {
  const updated = await db
    .update(invitations)
    .set({ revokedAt: new Date(nowMs()) })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.createdBy, byUserId),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id })
    .all();
  return updated.length > 0;
}

export async function adminRevokeInvitation(db: DB, id: string): Promise<boolean> {
  const updated = await db
    .update(invitations)
    .set({ revokedAt: new Date(nowMs()) })
    .where(and(eq(invitations.id, id), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id })
    .all();
  return updated.length > 0;
}

export async function userCanInvite(db: DB, userId: string): Promise<boolean> {
  const row = (await db
    .select({ isInvitee: users.isInvitee })
    .from(users)
    .where(eq(users.id, userId))
    .all())[0];
  return Boolean(row?.isInvitee);
}
