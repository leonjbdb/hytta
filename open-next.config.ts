import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext (Cloudflare) build configuration.
 *
 * Minimal on purpose: no R2/KV incremental cache override, since this app is
 * almost entirely dynamic authenticated pages. Add an `incrementalCache`
 * override here (and the matching binding in wrangler.jsonc) if ISR/SSG caching
 * is introduced later.
 *
 * The BookingDO Durable Object is a *separate* worker (workers/booking-do), so
 * the main worker is the stock `.open-next/worker.js` — no wrapper, no relaxed
 * config validation needed.
 */
export default defineCloudflareConfig();
