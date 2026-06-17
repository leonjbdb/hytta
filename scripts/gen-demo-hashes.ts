/**
 * Regenerates `src/lib/demo-password-hashes.ts` — the precomputed PBKDF2 hashes
 * for the default demo-account passwords.
 *
 *   bun run scripts/gen-demo-hashes.ts
 *
 * Why precompute: demo mode has no D1, so `createDemoState()` rebuilds the seed
 * in-isolate. Hashing the demo passwords at runtime (8 × PBKDF2 @ 100k iters)
 * costs ~200-300ms of synchronous CPU per rebuild, which blows the Workers
 * Free-plan 10ms CPU/request cap (manifests as `exceededCpu` 503s, notably on
 * the heavier /dashboard page). The demo passwords are fixed constants, so we
 * hash them once here and bake the result in.
 *
 * These are ONLY the default temp passwords. A demo user who changes their
 * password gets a fresh runtime hash stored in demo state as usual; this only
 * affects the values the seed starts from (until the next hourly demo reset).
 *
 * Re-run this whenever DEMO_ACCOUNT_PASSWORDS or DEMO_PASSWORD changes in
 * `src/lib/demo-constants.ts`. The `demo-password-hashes` test fails if the
 * baked hashes drift from the passwords, so drift can't pass CI silently.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '@/lib/auth/password';
import { DEMO_ACCOUNT_PASSWORDS, DEMO_PASSWORD } from '@/lib/demo-constants';

const OUT_PATH = resolve(import.meta.dir, '../src/lib/demo-password-hashes.ts');

async function main(): Promise<void> {
  const entries: [string, string][] = [];
  for (const [email, password] of Object.entries(DEMO_ACCOUNT_PASSWORDS)) {
    entries.push([email, await hashPassword(password)]);
  }
  const defaultHash = await hashPassword(DEMO_PASSWORD);

  const body = entries
    .map(([email, hash]) => `  ${JSON.stringify(email)}: ${JSON.stringify(hash)},`)
    .join('\n');

  const file = `/**
 * GENERATED — do not edit by hand. Run \`bun run scripts/gen-demo-hashes.ts\`.
 *
 * Precomputed PBKDF2 hashes of the default demo passwords in
 * \`demo-constants.ts\`, so \`createDemoState()\` never hashes at runtime (which
 * would blow the Workers Free-plan 10ms CPU cap on every in-isolate rebuild).
 * These cover only the default temp passwords; users can still change theirs.
 */
import { DEMO_ACCOUNT_PASSWORDS } from './demo-constants';

/** PBKDF2 hash of each account's default password, keyed by email. */
export const DEMO_PASSWORD_HASHES: Record<keyof typeof DEMO_ACCOUNT_PASSWORDS, string> = {
${body}
};

/** Hash of the generic fallback password (DEMO_PASSWORD). */
export const DEMO_DEFAULT_PASSWORD_HASH = ${JSON.stringify(defaultHash)};

/** Precomputed hash for an email, falling back to the generic one. */
export function demoPasswordHashFor(email: string): string {
  return DEMO_PASSWORD_HASHES[email] ?? DEMO_DEFAULT_PASSWORD_HASH;
}
`;

  writeFileSync(OUT_PATH, file);
  console.log(`Wrote ${entries.length} demo hashes + fallback to ${OUT_PATH}`);
}

await main();
