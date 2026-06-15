import 'server-only';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/db/client';
import { cottageSettings } from '@/db/schema';

/**
 * Cottage display name. The app is "Hytta"; each deployment names its own
 * cottage on first run via `/setup`. The chosen name is stored as a singleton
 * row and surfaced everywhere the cottage is referenced by name — the header
 * brand, the browser title, calendar feeds, and transactional emails.
 *
 * Reads are wrapped in `React.cache` so the many server components that need
 * the name in a single request share one query.
 */
const SINGLETON_ID = 'singleton';

/** App name — used as a fallback before the cottage has been named. */
export const APP_NAME = 'Hytta';

/** Maximum length accepted for a cottage name (UI + server validation share it). */
export const COTTAGE_NAME_MAX = 60;

/**
 * The configured cottage name, or `null` when setup has not run yet. Returns
 * `null` (rather than throwing) if the table does not exist — e.g. at build
 * time before migrations have been applied.
 */
export const getCottageName = cache(async (): Promise<string | null> => {
  try {
    const row = (
      await db
        .select({ name: cottageSettings.name })
        .from(cottageSettings)
        .where(eq(cottageSettings.id, SINGLETON_ID))
        .all()
    )[0];
    const name = row?.name?.trim();
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
});

/** Cottage name if configured, otherwise the app name. Never null. */
export async function cottageNameOrApp(): Promise<string> {
  return (await getCottageName()) ?? APP_NAME;
}

/** True once the operator has named the cottage. */
export async function isCottageConfigured(): Promise<boolean> {
  return (await getCottageName()) !== null;
}

/**
 * Persist the cottage name. Upserts the singleton row so a re-run replaces the
 * existing value. Callers are responsible for trimming/validating; this stores
 * the trimmed value verbatim.
 */
export async function setCottageName(name: string): Promise<void> {
  const trimmed = name.trim();
  await db
    .insert(cottageSettings)
    .values({ id: SINGLETON_ID, name: trimmed })
    .onConflictDoUpdate({
      target: cottageSettings.id,
      set: { name: trimmed, updatedAt: Math.floor(Date.now() / 1000) },
    })
    .run();
}
