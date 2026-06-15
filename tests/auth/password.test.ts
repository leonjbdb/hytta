import { describe, it, expect } from 'bun:test';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password (PBKDF2-HMAC-SHA256)', () => {
  it('hashes and verifies the same password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^pbkdf2\$sha256\$\d+\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('letmein-please-12');
    expect(await verifyPassword(hash, 'letmein-please-13')).toBe(false);
  });

  it('rejects malformed hashes without throwing', async () => {
    expect(await verifyPassword('not-a-real-hash', 'whatever')).toBe(false);
  });

  it('produces a fresh salt per call', async () => {
    const a = await hashPassword('same-password-here');
    const b = await hashPassword('same-password-here');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same-password-here')).toBe(true);
    expect(await verifyPassword(b, 'same-password-here')).toBe(true);
  });
});
