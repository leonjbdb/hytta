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
const config = defineCloudflareConfig();

/**
 * Run the plain Next build, NOT the package `build` script — `build` is the
 * Cloudflare wrapper (`scripts/cloudflare.ts build`) that invokes OpenNext,
 * which then calls this command. Defaulting to `bun run build` would re-enter
 * the wrapper and recurse forever, so point it at a dedicated `next build`.
 */
config.buildCommand = 'bun run build:next';

export default config;
