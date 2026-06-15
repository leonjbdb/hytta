import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { makeTestDb, type TestDb } from '../helpers/db';
import {
  consumePasswordReset,
  findValidReset,
  hashToken,
  invalidateOtherResetsFor,
  mintPasswordReset,
  RESET_TOKEN_TTL_MS,
} from '@/lib/auth/password-reset';
import type { DB } from '@/db/client';

let t: TestDb;
let userId: string;

beforeEach(async () => {
  t = await makeTestDb();
  userId = (await t.seed()).userId;
});

afterEach(async () => {
  await t.cleanup();
});

const db = () => t.db as unknown as DB;

describe('password-reset.mintPasswordReset', () => {
  it('returns a URL-safe raw token and sets expiry ~1h ahead', async () => {
    const m = await mintPasswordReset(db(), userId);
    expect(m.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const drift = m.expiresAt.getTime() - Date.now();
    expect(drift).toBeGreaterThan(RESET_TOKEN_TTL_MS - 5_000);
    expect(drift).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS + 5_000);
  });

  it('persists only the SHA-256 hash, not the raw token', async () => {
    const m = await mintPasswordReset(db(), userId);
    const row = (await t.d1
      .prepare(`SELECT token_hash FROM password_reset_token WHERE user_id = ?`)
      .bind(userId)
      .first()) as { token_hash: string } | null;
    expect(row?.token_hash).toBe(hashToken(m.token));
    expect(row?.token_hash).not.toBe(m.token);
  });
});

describe('password-reset.findValidReset', () => {
  it('resolves the raw token to its row when active', async () => {
    const m = await mintPasswordReset(db(), userId);
    const found = await findValidReset(db(), m.token);
    expect(found?.userId).toBe(userId);
  });

  it('returns null for unknown / blank tokens', async () => {
    expect(await findValidReset(db(), '')).toBeNull();
    expect(await findValidReset(db(), 'totally-not-a-token')).toBeNull();
  });

  it('returns null once consumed', async () => {
    const m = await mintPasswordReset(db(), userId);
    expect(await consumePasswordReset(db(), m.token)).toBe(true);
    expect(await findValidReset(db(), m.token)).toBeNull();
  });

  it('returns null once expired', async () => {
    const m = await mintPasswordReset(db(), userId);
    await t.exec(
      `UPDATE password_reset_token SET expires_at = 1 WHERE token_hash = '${hashToken(m.token)}';`,
    );
    expect(await findValidReset(db(), m.token)).toBeNull();
  });
});

describe('password-reset.consumePasswordReset', () => {
  it('returns true exactly once', async () => {
    const m = await mintPasswordReset(db(), userId);
    expect(await consumePasswordReset(db(), m.token)).toBe(true);
    expect(await consumePasswordReset(db(), m.token)).toBe(false);
  });

  it('refuses to consume an expired token', async () => {
    const m = await mintPasswordReset(db(), userId);
    await t.exec(
      `UPDATE password_reset_token SET expires_at = 1 WHERE token_hash = '${hashToken(m.token)}';`,
    );
    expect(await consumePasswordReset(db(), m.token)).toBe(false);
  });
});

describe('password-reset.invalidateOtherResetsFor', () => {
  it('marks all of the user’s outstanding tokens consumed', async () => {
    const a = await mintPasswordReset(db(), userId);
    const b = await mintPasswordReset(db(), userId);
    await invalidateOtherResetsFor(db(), userId);
    expect(await findValidReset(db(), a.token)).toBeNull();
    expect(await findValidReset(db(), b.token)).toBeNull();
  });
});
