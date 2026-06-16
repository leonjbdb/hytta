import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { rewriteOrigin } from '@/lib/url';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

/**
 * The origin (`scheme://host[:port]`) the current request actually arrived on,
 * derived from the forwarded / Host headers. This is what in-email links use so
 * they always match the host AND port the user is on — `localhost:3000`,
 * `localhost:3002`, `example.com`, a preview URL, anything — rather than a
 * single hard-coded `AUTH_URL`.
 *
 * Falls back to `AUTH_URL` when there is no request context (build, scripts).
 */
export async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) {
      const proto =
        h.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
        (LOCAL_HOST.test(host) ? 'http' : 'https');
      return `${proto}://${host}`;
    }
  } catch {
    // Outside a request scope — fall through to the configured URL.
  }
  return (env.AUTH_URL ?? '').replace(/\/+$/, '');
}

/**
 * Rewrite an absolute URL's origin to the current request origin. Used for the
 * magic-link URL that Auth.js builds from `AUTH_URL`, so the emailed link points
 * back at the host (and port) the sign-in was requested from.
 */
export async function withRequestOrigin(rawUrl: string): Promise<string> {
  return rewriteOrigin(rawUrl, await requestOrigin());
}
