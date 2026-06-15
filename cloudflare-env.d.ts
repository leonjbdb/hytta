// Ambient types for the Cloudflare bindings exposed to the Worker.
//
// `getCloudflareContext().env` is typed as `CloudflareEnv`. Keep this in sync
// with `wrangler.jsonc` (bindings) and the secrets/vars you configure. The
// string-valued vars are also mirrored onto `process.env` by OpenNext, which is
// what `src/lib/env.ts` validates at boot.
import type { BookingDO } from '@/server/booking/booking-do';

declare global {
  interface CloudflareEnv {
    /** D1 database binding (see wrangler.jsonc → d1_databases). */
    DB: D1Database;
    /** Durable Object namespace serialising all reservation mutations. */
    BOOKING: DurableObjectNamespace<BookingDO>;
    /** Static assets (provided by OpenNext). */
    ASSETS: Fetcher;

    // --- Secrets & vars (also mirrored onto process.env by OpenNext) ---
    AUTH_SECRET: string;
    AUTH_URL: string;
    EMAIL_FROM: string;
    RESEND_API_KEY?: string;
    EMAIL_PROVIDER?: 'resend' | 'smtp';
    SMTP_HOST?: string;
    SMTP_PORT?: string;
    SMTP_USER?: string;
    SMTP_PASS?: string;
    SMTP_SECURE?: string;
    ADMIN_EMAILS?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
  }
}

export {};
