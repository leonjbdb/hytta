import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/db/client';
import { cottageSettings } from '@/db/schema';
import { isDemoMode } from '@/lib/demo-mode';

// Re-exported so server callers can keep importing limits from `@/lib/cottage`.
// The canonical home is the client-safe `cottage-limits` module.
export { COTTAGE_DESCRIPTION_MAX, COTTAGE_NAME_MAX } from './cottage-limits';

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
  } catch (err) {
    if (isDemoMode()) throw err;
    return null;
  }
});

/** Cottage name if configured, otherwise the app name. Never null. */
export async function cottageNameOrApp(): Promise<string> {
  return (await getCottageName()) ?? APP_NAME;
}

/**
 * The operator-chosen link-preview description, or `null` when it hasn't been
 * set. Like {@link getCottageName}, returns `null` rather than throwing if the
 * table/column is missing (e.g. at build time before migrations run).
 */
export const getCottageDescription = cache(async (): Promise<string | null> => {
  try {
    const row = (
      await db
        .select({ description: cottageSettings.description })
        .from(cottageSettings)
        .where(eq(cottageSettings.id, SINGLETON_ID))
        .all()
    )[0];
    const description = row?.description?.trim();
    return description && description.length > 0 ? description : null;
  } catch (err) {
    if (isDemoMode()) throw err;
    return null;
  }
});

/**
 * Description for link previews: the operator's text if set, otherwise a plain
 * default built from the cottage name (never the empty string).
 */
export async function cottageDescriptionOrDefault(): Promise<string> {
  return (await getCottageDescription()) ?? `Book your stay at ${await cottageNameOrApp()}.`;
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

/**
 * Persist the cottage's first-run/admin-edit settings in one write. An
 * empty/blank description clears it back to `null` (so the default applies).
 */
export async function setCottageSettings({
  name,
  description,
}: {
  name: string;
  description: string;
}): Promise<void> {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(cottageSettings)
    .values({
      id: SINGLETON_ID,
      name: trimmedName,
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
    })
    .onConflictDoUpdate({
      target: cottageSettings.id,
      set: {
        name: trimmedName,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
        updatedAt: now,
      },
    })
    .run();
}

/**
 * Persist the link-preview description on the singleton row. An empty/blank
 * value clears it back to `null` (so the default applies again). Updates in
 * place — the row already exists once the cottage has been named, which is the
 * only path that reaches the admin settings form.
 */
export async function setCottageDescription(description: string): Promise<void> {
  const trimmed = description.trim();
  await db
    .update(cottageSettings)
    .set({
      description: trimmed.length > 0 ? trimmed : null,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(cottageSettings.id, SINGLETON_ID))
    .run();
}
