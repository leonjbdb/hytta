import { spawn, spawnSync, type ChildProcess } from "node:child_process";

/**
 * Production-identical local run: the app worker AND the BookingDO worker, both
 * on workerd via wrangler dev — same runtime, same DO, same D1 as production.
 * Unlike `bun run dev` there's no hot reload (re-run after changes), but the app
 * itself runs on workerd rather than Node, so it's the closest match to prod for
 * a final check.
 *
 * Secrets come from `.env.local` (OpenNext bundles them into the worker at
 * build), and the local D1 is the same store `dev`/`db:*` use.
 */
const PERSIST = ".wrangler/state";
const DO_PORT = 8799;
const WRANGLER = "./node_modules/.bin/wrangler";

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Applying local D1 migrations…");
run(WRANGLER, ["d1", "migrations", "apply", "hytta", "--local", "--persist-to", PERSIST]);

console.log("Building the Cloudflare worker…");
run("bunx", ["opennextjs-cloudflare", "build"]);

// The app worker binds BookingDO cross-script, so the DO worker must be running
// for the binding to resolve — start it alongside (shared local D1 + registry).
console.log(`Starting BookingDO worker (workerd) on port ${DO_PORT}…`);
const doWorker = spawn(
  WRANGLER,
  [
    "dev",
    "--config",
    "workers/booking-do/wrangler.jsonc",
    "--port",
    String(DO_PORT),
    "--persist-to",
    PERSIST,
  ],
  { stdio: "inherit" },
);

console.log("Starting the app on workerd (wrangler dev) — production-identical…");
const app = spawn("bunx", ["opennextjs-cloudflare", "preview"], { stdio: "inherit" });

const children: ChildProcess[] = [doWorker, app];

function shutdown(signal: NodeJS.Signals): void {
  for (const c of children) {
    if (c.exitCode === null && !c.killed) {
      try {
        c.kill(signal);
      } catch {
        // already gone
      }
    }
  }
}

process.on("SIGINT", () => {});
for (const signal of ["SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => shutdown(signal));
}

let exited = 0;
let firstCode: number | null = 0;
for (const c of children) {
  c.on("exit", (code, signal) => {
    if (exited === 0) firstCode = code ?? (signal ? 1 : 0);
    exited += 1;
    shutdown("SIGTERM");
    if (exited === children.length) {
      if (process.stdout.isTTY) process.stdout.write("\x1b[?25h");
      process.exit(firstCode ?? 0);
    }
  });
}
