/**
 * In-memory sliding-window rate limiter. Single-instance only — restarts
 * clear all state, and horizontally-scaled deployments would need a shared
 * store (DB or Redis) to be useful. Fine for the cottage app's single-process
 * footprint; documented as a known trade-off in the auth rework plan.
 *
 * The map is module-scope so all callers share buckets within a process.
 */

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  /** Milliseconds the caller should wait before retrying. 0 when ok. */
  retryAfterMs: number;
  /** Remaining attempts in the current window after this call. */
  remaining: number;
}

/**
 * Record an attempt for `key` and return whether it is allowed under the
 * given window. Allowed attempts are counted; denied attempts are not (so
 * a flooded attacker doesn't extend their own lockout indefinitely — the
 * window expires when the in-window successful attempts fall off).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const stamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (stamps.length >= limit) {
    buckets.set(key, stamps);
    const oldest = stamps[0]!;
    return { ok: false, retryAfterMs: oldest + windowMs - now, remaining: 0 };
  }

  stamps.push(now);
  buckets.set(key, stamps);
  return { ok: true, retryAfterMs: 0, remaining: limit - stamps.length };
}

/** Test-only: clear all buckets between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
