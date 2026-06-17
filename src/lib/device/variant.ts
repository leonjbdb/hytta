/**
 * Client-safe device-variant primitives. Kept free of server-only imports
 * (`next/headers`) so client components — e.g. `DeviceVariantSync` — can share
 * the cookie name and type without pulling the server resolver into their
 * bundle. `resolve.ts` re-exports these for existing server-side importers.
 */

export type DeviceVariant = 'mobile' | 'desktop';

/** Cookie name that pins the variant regardless of UA. */
export const DEVICE_OVERRIDE_COOKIE = 'hytta-device';
