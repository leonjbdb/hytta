import { createHash, randomBytes } from 'node:crypto';

/**
 * Shared single-use-token primitives for the email-delivered auth flows
 * (password reset, email change). The raw token travels in the link the user
 * receives; only its SHA-256 hash is ever persisted, so a database read can't
 * be replayed against the live link for the residual TTL.
 */

/** 256-bit URL-safe token returned to the user; never stored verbatim. */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex of the raw token. The hash is what we persist. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
