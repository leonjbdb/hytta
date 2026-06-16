import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const PREFERRED = 3000;
const FALLBACK = 3002;
const DO_PORT = 8799;
const PERSIST = ".wrangler/state";
const WRANGLER = "./node_modules/.bin/wrangler";
const DEMO_ENV = "DEMO";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    if (!match?.[1]) continue;

    let value = (match[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function isDemo(): boolean {
  const fileEnv = parseEnvFile(resolve(".env.local"));
  return (process.env[DEMO_ENV] ?? fileEnv[DEMO_ENV] ?? "").trim().toLowerCase() === "true";
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

const demo = isDemo();
let doWorker: ChildProcess | null = null;

if (demo) {
  console.log("DEMO=true: skipping local D1 migrations and BookingDO worker.");
} else {
  // One local D1, shared by `next dev`, the BookingDO worker, and `db:*`. Apply
  // migrations first so a fresh checkout never starts against an empty schema.
  // Idempotent — already-applied migrations are skipped.
  console.log("Applying local D1 migrations…");
  const migrate = spawnSync(
    WRANGLER,
    ["d1", "migrations", "apply", "hytta", "--local", "--persist-to", PERSIST],
    { stdio: "inherit" },
  );
  if (migrate.status !== 0) {
    console.error("Local D1 migration failed — aborting dev start.");
    process.exit(migrate.status ?? 1);
  }

  // Start the BookingDO worker on workerd. `next dev` reaches its Durable Object
  // cross-process via the wrangler dev registry, so bookings work in dev exactly
  // like production. It binds the same local D1 (same --persist-to).
  console.log(`Starting BookingDO worker (workerd) on port ${DO_PORT}…`);
  doWorker = spawn(
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
}

const port = (await isFree(PREFERRED)) ? PREFERRED : FALLBACK;
console.log(`Starting Next.js dev on port ${port}…`);
// Run Next under the Bun runtime (not node). The Cloudflare dev bindings
// (`getPlatformProxy` via `initOpenNextCloudflareForDev`) work under Bun, and
// Bun avoids node's hard ~8 GB old-space heap cap that OOM'd long dev sessions.
const next = spawn("bun", ["--bun", "next", "dev", "-p", String(port)], {
  stdio: "inherit",
});

// --- Lifecycle: run both, and when one exits bring the other down too. ---
const children: ChildProcess[] = doWorker ? [doWorker, next] : [next];

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

// Ctrl+C delivers SIGINT to the whole process group, so both children get it
// directly and restore the terminal as they exit. Stay alive (don't let the
// default SIGINT tear this wrapper down first) and follow them out. SIGTERM /
// SIGHUP may target only our PID, so forward those.
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
    shutdown("SIGTERM"); // bring the sibling down
    if (exited === children.length) {
      if (process.stdout.isTTY) process.stdout.write("\x1b[?25h");
      process.exit(firstCode ?? 0);
    }
  });
}
