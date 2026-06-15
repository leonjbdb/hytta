import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit is used only to *generate* SQLite migrations from the schema
 * (`bun run db:generate`). They are *applied* to D1 with
 * `wrangler d1 migrations apply` (see the db:migrate:* scripts), not by
 * drizzle-kit, so no database credentials are needed here.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  strict: true,
  verbose: true,
});
