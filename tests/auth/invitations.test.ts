import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { makeTestDb, type TestDb } from '../helpers/db';
import {
  adminRevokeInvitation,
  consumeInvitation,
  createInvitation,
  findValidInvitation,
  generateInviteToken,
  listUserInvitations,
  revokeInvitation,
  userCanInvite,
} from '@/lib/auth/invitations';
import type { DB } from '@/db/client';

let t: TestDb;
let inviterId: string;
let outsiderId: string;

beforeEach(async () => {
  t = await makeTestDb();
  const seed = await t.seed();
  inviterId = seed.userId;
  outsiderId = seed.otherUserId;
  // Promote the inviter; demote the outsider so userCanInvite can test both.
  await t.exec(`UPDATE user SET is_invitee = 1 WHERE id = '${inviterId}';`);
  await t.exec(`UPDATE user SET is_invitee = 0 WHERE id = '${outsiderId}';`);
});

afterEach(async () => {
  await t.cleanup();
});

const db = () => t.db as unknown as DB;

describe('invitations.generateInviteToken', () => {
  it('produces 256-bit URL-safe tokens', () => {
    const tok = generateInviteToken();
    expect(tok).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Two calls must not collide (entropy sanity).
    expect(tok).not.toBe(generateInviteToken());
  });
});

describe('invitations.createInvitation', () => {
  it('persists with the supplied options', async () => {
    const inv = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: 1,
      durationHours: 24,
    });
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inv.maxUses).toBe(1);
    expect(inv.useCount).toBe(0);
    expect(inv.email).toBeNull();
    expect(inv.revokedAt).toBeNull();
    expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('stores a pre-bound email when provided', async () => {
    const inv = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: 1,
      durationHours: 24,
      email: 'guest@example.com',
    });
    expect(inv.email).toBe('guest@example.com');
  });

  it('clamps duration to the [24, 168] range', async () => {
    const tooShort = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 1,
    });
    const tooLong = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 9999,
    });
    const lower = tooShort.expiresAt.getTime() - Date.now();
    const upper = tooLong.expiresAt.getTime() - Date.now();
    expect(lower).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(lower).toBeLessThan(25 * 60 * 60 * 1000);
    expect(upper).toBeGreaterThan(167 * 60 * 60 * 1000);
    expect(upper).toBeLessThan(169 * 60 * 60 * 1000);
  });
});

describe('invitations.findValidInvitation', () => {
  it('returns active invitations', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 48,
    });
    const found = await findValidInvitation(db(), i.token);
    expect(found?.id).toBe(i.id);
  });

  it('returns null for unknown tokens', async () => {
    expect(await findValidInvitation(db(), 'no-such-token')).toBeNull();
    expect(await findValidInvitation(db(), '')).toBeNull();
  });

  it('returns null for revoked invitations', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 48,
    });
    await revokeInvitation(db(), i.id, inviterId);
    expect(await findValidInvitation(db(), i.token)).toBeNull();
  });

  it('returns null for expired invitations', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 24,
    });
    // Force expiry in raw SQL — bypasses the lib's 24 h floor.
    await t.exec(`UPDATE invitation SET expires_at = 1 WHERE id = '${i.id}';`);
    expect(await findValidInvitation(db(), i.token)).toBeNull();
  });

  it('returns null for single-use invitations already consumed', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: 1,
      durationHours: 24,
    });
    expect(await consumeInvitation(db(), i.token)).toBe(true);
    expect(await findValidInvitation(db(), i.token)).toBeNull();
  });
});

describe('invitations.consumeInvitation', () => {
  it('refuses revoked invitations', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 48,
    });
    await revokeInvitation(db(), i.id, inviterId);
    expect(await consumeInvitation(db(), i.token)).toBe(false);
  });

  it('increments useCount on multi-use invites', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 48,
    });
    expect(await consumeInvitation(db(), i.token)).toBe(true);
    expect(await consumeInvitation(db(), i.token)).toBe(true);
    const r = (await findValidInvitation(db(), i.token))!;
    expect(r.useCount).toBe(2);
  });

  it('only allows one consumer for a single-use invite under simulated concurrency', async () => {
    // The WHERE-guard on the atomic increment must prevent a second consume from
    // succeeding even when callers race back-to-back.
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: 1,
      durationHours: 24,
    });
    const results = await Promise.all([
      consumeInvitation(db(), i.token),
      consumeInvitation(db(), i.token),
      consumeInvitation(db(), i.token),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('invitations.revokeInvitation', () => {
  it('revokes the creator’s own invite', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 24,
    });
    expect(await revokeInvitation(db(), i.id, inviterId)).toBe(true);
    expect(await revokeInvitation(db(), i.id, inviterId)).toBe(false);
  });

  it('refuses revocation by a different user', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 24,
    });
    expect(await revokeInvitation(db(), i.id, outsiderId)).toBe(false);
  });

  it('admins can bypass the creator check via adminRevokeInvitation', async () => {
    const i = await createInvitation(db(), {
      createdBy: inviterId,
      maxUses: null,
      durationHours: 24,
    });
    expect(await adminRevokeInvitation(db(), i.id)).toBe(true);
    expect(await adminRevokeInvitation(db(), i.id)).toBe(false);
  });
});

describe('invitations.listUserInvitations', () => {
  it('returns only the requesting user’s invites, newest first', async () => {
    await createInvitation(db(), { createdBy: inviterId, maxUses: 1, durationHours: 24 });
    await createInvitation(db(), { createdBy: inviterId, maxUses: null, durationHours: 48 });
    await createInvitation(db(), { createdBy: outsiderId, maxUses: 1, durationHours: 24 });
    const list = await listUserInvitations(db(), inviterId);
    expect(list).toHaveLength(2);
    for (const row of list) expect(row.createdBy).toBe(inviterId);
  });
});

describe('invitations.userCanInvite', () => {
  it('reflects the live is_invitee flag', async () => {
    expect(await userCanInvite(db(), inviterId)).toBe(true);
    expect(await userCanInvite(db(), outsiderId)).toBe(false);
  });
});
