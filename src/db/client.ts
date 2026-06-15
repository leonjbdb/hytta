import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzleFor, type DB } from './drizzle';

/**
 * Request-scoped D1 access for the Next app.
 *
 * D1 is async-only and the binding lives on the *per-request* environment, not
 * as a process-wide singleton, so there is no module-level `db` to import.
 * Every consumer calls `getDb()` (or uses the `db` proxy) inside a request
 * scope. Under `next dev` the binding is provided by
 * `initOpenNextCloudflareForDev()` (see `next.config.ts`).
 *
 * The plain factory (`drizzleFor`) and `DB` type live in `./drizzle`, free of
 * the OpenNext context helper, so the standalone BookingDO worker can reuse
 * them without bundling the Next runtime.
 */
export { drizzleFor, type DB };

/** Request-scoped Drizzle client. Resolves the D1 binding from the request context. */
export function getDb(): DB {
  const { env } = getCloudflareContext();
  return drizzleFor(env.DB);
}

/**
 * Backwards-compatible `db` handle: a lazy proxy that resolves a fresh
 * request-scoped client on each top-level property access, so existing
 * `db.select()…`/`db.insert()…` call sites keep working (the only change being
 * that D1 is async — terminal `.all()/.get()/.run()` must be `await`ed). Safe to
 * hand to module-load consumers like the NextAuth adapter, since resolution is
 * deferred to call time. Must run inside a request scope. New code prefers
 * `getDb()`.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
