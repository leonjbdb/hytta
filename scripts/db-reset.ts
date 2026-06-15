/**
 * Reset the LOCAL D1 database to a clean state.
 *
 *   bun run db:reset          # wipe local data, re-apply migrations (empty schema)
 *   bun run db:reset --demo   # ...then load fictional demo data (see src/db/demo.ts)
 *
 * Deletes only the local D1 store under `.wrangler/state/v3/d1` (the same DB
 * that `next dev`, `db:migrate`, and `bun run demo` share) — the Durable Object
 * and cache state are left untouched, and the REMOTE D1 is never affected.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const D1_DIR = resolve(process.cwd(), ".wrangler/state/v3/d1");
const withDemo = process.argv.includes("--demo");

if (existsSync(D1_DIR)) {
  rmSync(D1_DIR, { recursive: true, force: true });
  console.log("Removed local D1 state.");
} else {
  console.log("No local D1 state found — nothing to remove.");
}

console.log("Re-applying migrations…");
const migrate = spawnSync(
  "bunx",
  ["wrangler", "d1", "migrations", "apply", "hytta", "--local"],
  { stdio: "inherit" },
);
if (migrate.status !== 0) {
  console.error("Migration failed.");
  process.exit(migrate.status ?? 1);
}

if (withDemo) {
  console.log("Loading demo data…");
  const demo = spawnSync("bun", ["run", "src/db/demo.ts"], { stdio: "inherit" });
  if (demo.status !== 0) {
    console.error("Demo load failed.");
    process.exit(demo.status ?? 1);
  }
}

console.log(`Local D1 reset complete${withDemo ? " (demo data loaded)" : ""}.`);
