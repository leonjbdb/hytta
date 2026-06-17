import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { DEVICE_OVERRIDE_COOKIE, type DeviceVariant } from './variant';

// Re-exported so existing server-side importers can keep reading these from
// `./resolve`; the canonical (client-safe) definitions live in `./variant`.
export { DEVICE_OVERRIDE_COOKIE, type DeviceVariant };

/**
 * Tiny User-Agent classifier. Designed for a private, self-hosted app — not a
 * cache-fragmented CDN deployment — so the usual UA-detection caveats don't
 * apply. iPad reports a Mac UA and is intentionally treated as desktop.
 *
 * If the `hytta-device` cookie is set to `mobile` or `desktop`, that
 * overrides UA — useful for testing the mobile layout in a desktop browser
 * (visit `/api/device/mobile` to set, `/api/device/clear` to remove).
 *
 * Wrapped in `React.cache` so several server components in the same request
 * (Header + page) share the result without re-parsing.
 */
export const resolveDeviceVariant = cache(async (): Promise<DeviceVariant> => {
  const c = await cookies();
  const override = c.get(DEVICE_OVERRIDE_COOKIE)?.value;
  if (override === 'mobile' || override === 'desktop') return override;

  const h = await headers();
  const ua = h.get('user-agent') ?? '';
  return classifyUserAgent(ua);
});

/** Pure UA → variant function. Exposed for tests; production reads from `headers()`. */
export function classifyUserAgent(ua: string): DeviceVariant {
  return /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'desktop';
}
