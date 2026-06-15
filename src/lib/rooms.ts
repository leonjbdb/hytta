import 'server-only';
import { cache } from 'react';
import { db } from '@/db/client';
import { rooms } from '@/db/schema';

/**
 * Whether the cottage has at least one room. A freshly set-up cottage has none
 * (no default rooms are created), and the authenticated layout forces room
 * setup until this is true. Wrapped in `React.cache` so the many server
 * components that check it in a single request share one query. Returns `false`
 * if the table is missing (pre-migration) — treated as "no rooms yet".
 */
export const hasAnyRoom = cache(async (): Promise<boolean> => {
  try {
    const rows = await db.select({ id: rooms.id }).from(rooms).limit(1).all();
    return rows.length > 0;
  } catch {
    return false;
  }
});
