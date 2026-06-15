import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * The Drizzle handle type and the factory that builds one from a D1 binding.
 *
 * Kept free of any Next/OpenNext imports (`getCloudflareContext`) so the
 * standalone BookingDO worker — which only has a raw `env.DB` — can bundle this
 * without dragging in the Next runtime. Request-scoped access lives in
 * `client.ts`.
 */
export type DB = DrizzleD1Database<typeof schema>;

export function drizzleFor(d1: D1Database): DB {
  return drizzle(d1, { schema, casing: 'snake_case' });
}
