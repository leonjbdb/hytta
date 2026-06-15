/**
 * Suite runner that executes each test file in its own `bun test` process.
 *
 * Why: the D1 test harness (tests/helpers/db.ts) boots a fresh in-memory
 * Miniflare worker per `makeTestDb()`. Miniflare keeps process-global state
 * (workerd runtime config, temp dirs, file descriptors), so creating and
 * disposing many instances inside a SINGLE process — which is what a plain
 * `bun test` does when it loads every file into one runner — races on that
 * shared state and intermittently throws `EBADF` / config-write errors.
 *
 * Each file passes deterministically on its own, so we give every file its own
 * process. Test bodies and assertions are unchanged; this only affects how the
 * files are scheduled.
 *
 * Pass file/dir args to scope the run (e.g. `bun run scripts/test.ts tests/auth`).
 * Plain `bun test <file>` still works for single files during development.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

function collectTestFiles(target: string): string[] {
  const abs = resolve(ROOT, target);
  const st = statSync(abs);
  if (st.isFile()) return abs.endsWith('.test.ts') ? [abs] : [];
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    out.push(...collectTestFiles(join(abs, entry)));
  }
  return out;
}

const targets = process.argv.slice(2);
const roots = targets.length > 0 ? targets : ['tests'];
const files = roots.flatMap(collectTestFiles).sort();

if (files.length === 0) {
  console.error('No test files found for:', roots.join(', '));
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const rel = file.slice(ROOT.length + 1);
  // A cold Miniflare/workerd boot in beforeEach can exceed bun's default 5s
  // per-test timeout on a loaded machine; give hooks ample headroom.
  const res = spawnSync('bun', ['test', '--timeout', '30000', rel], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (res.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
