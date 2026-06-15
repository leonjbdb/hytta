import { describe, it, expect, beforeEach } from 'bun:test';
import { rateLimit, resetRateLimits } from '@/lib/auth/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit and then blocks', () => {
    for (let i = 0; i < 5; i++) {
      const r = rateLimit('k', 5, 60_000);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const blocked = rateLimit('k', 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates buckets by key', () => {
    rateLimit('a', 1, 60_000);
    expect(rateLimit('a', 1, 60_000).ok).toBe(false);
    // Different key still has its full quota.
    expect(rateLimit('b', 1, 60_000).ok).toBe(true);
  });

  it('lets attempts back in once the window slides', async () => {
    expect(rateLimit('slide', 1, 50).ok).toBe(true);
    expect(rateLimit('slide', 1, 50).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(rateLimit('slide', 1, 50).ok).toBe(true);
  });

  it('does not count denied attempts toward the cap', async () => {
    // Fill the bucket
    rateLimit('count', 1, 200);
    // Hammer with denied attempts; the original window must still elapse
    // — denied calls should NOT extend it.
    for (let i = 0; i < 10; i++) rateLimit('count', 1, 200);
    await new Promise((r) => setTimeout(r, 220));
    expect(rateLimit('count', 1, 200).ok).toBe(true);
  });
});
