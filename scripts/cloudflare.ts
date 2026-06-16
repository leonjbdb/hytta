import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

type Command = "db:migrate:remote" | "build" | "deploy:do" | "deploy";

const D1_DATABASE_ID_ENV = "HYTTA_D1_DATABASE_ID";
const WORKER_NAME_ENV = "HYTTA_WORKER_NAME";
const BOOKING_DO_WORKER_SUFFIX = "-booking-do";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const CONFIGS = {
  app: {
    source: "wrangler.jsonc",
    generated: "wrangler.local.jsonc",
  },
  bookingDo: {
    source: "workers/booking-do/wrangler.jsonc",
    generated: "workers/booking-do/wrangler.local.jsonc",
  },
} as const;

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    if (!match) continue;

    const key = match[1];
    if (!key) continue;

    let value = (match[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

type GeneratedNames = {
  appWorkerName: string;
  bookingDoWorkerName: string;
};

function readEnvValue(name: string, fileEnv: Record<string, string>): string {
  return (process.env[name] ?? fileEnv[name] ?? "").trim();
}

function requireEnvValue(name: string, fileEnv: Record<string, string>): string {
  const value = readEnvValue(name, fileEnv);
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local or export it before ` +
        "running Cloudflare remote commands.",
    );
  }
  return value;
}

function requireD1DatabaseId(fileEnv: Record<string, string>): string {
  const databaseId = requireEnvValue(D1_DATABASE_ID_ENV, fileEnv);
  if (!UUID_PATTERN.test(databaseId)) {
    throw new Error(`${D1_DATABASE_ID_ENV} must be a D1 database UUID.`);
  }
  return databaseId;
}

function assertWorkerName(name: string, label: string): void {
  if (name.length > 63) {
    throw new Error(`${label} must be 63 characters or fewer.`);
  }
  if (!WORKER_NAME_PATTERN.test(name)) {
    throw new Error(
      `${label} must use only lowercase letters, numbers, and dashes, ` +
        "and cannot start or end with a dash.",
    );
  }
}

function requireGeneratedNames(fileEnv: Record<string, string>): GeneratedNames {
  const appWorkerName = requireEnvValue(WORKER_NAME_ENV, fileEnv);
  const bookingDoWorkerName = `${appWorkerName}${BOOKING_DO_WORKER_SUFFIX}`;

  assertWorkerName(appWorkerName, WORKER_NAME_ENV);
  assertWorkerName(bookingDoWorkerName, `${WORKER_NAME_ENV}${BOOKING_DO_WORKER_SUFFIX}`);

  return { appWorkerName, bookingDoWorkerName };
}

function withDatabaseId(config: string, databaseId: string, sourcePath: string): string {
  const existingId = /"database_id"\s*:\s*"[^"]*"/;
  if (existingId.test(config)) {
    return config.replace(existingId, `"database_id": "${databaseId}"`);
  }

  const databaseNameLine = /^(\s*"database_name"\s*:\s*"hytta")(,?)(\r?\n)/m;
  const match = databaseNameLine.exec(config);
  const matchedLine = match?.[1];
  const newline = match?.[3];
  if (!matchedLine || !newline) {
    throw new Error(`Could not find the hytta D1 database entry in ${sourcePath}.`);
  }

  const indent = matchedLine.match(/^\s*/)?.[0] ?? "";
  return config.replace(
    databaseNameLine,
    `${matchedLine},${newline}${indent}"database_id": "${databaseId}",${newline}`,
  );
}

function replaceStringProperty(
  config: string,
  propertyName: string,
  value: string,
  sourcePath: string,
): string {
  const property = new RegExp(`^(\\s*"${propertyName}"\\s*:\\s*)"[^"]*"`, "m");
  if (!property.test(config)) {
    throw new Error(`Could not find ${propertyName} in ${sourcePath}.`);
  }
  return config.replace(property, `$1"${value}"`);
}

function withGeneratedNames(
  config: string,
  names: GeneratedNames,
  sourcePath: string,
): string {
  if (sourcePath === CONFIGS.app.source) {
    const withAppName = replaceStringProperty(
      config,
      "name",
      names.appWorkerName,
      sourcePath,
    );
    if (!/"script_name"\s*:\s*"[^"]*"/.test(withAppName)) {
      throw new Error(`Could not find script_name in ${sourcePath}.`);
    }
    return withAppName.replace(
      /("script_name"\s*:\s*)"[^"]*"/,
      `$1"${names.bookingDoWorkerName}"`,
    );
  }

  return replaceStringProperty(config, "name", names.bookingDoWorkerName, sourcePath);
}

function writeGeneratedConfig(
  sourcePath: string,
  generatedPath: string,
  databaseId: string,
  names: GeneratedNames,
): string {
  const source = readFileSync(sourcePath, "utf8");
  const generated = [
    `// Generated by scripts/cloudflare.ts from ${D1_DATABASE_ID_ENV} and ${WORKER_NAME_ENV}.`,
    "// Do not edit or commit this file.",
    withGeneratedNames(withDatabaseId(source, databaseId, sourcePath), names, sourcePath),
  ].join("\n");

  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, generated);
  return generatedPath;
}

function writeGeneratedConfigs(): typeof CONFIGS {
  const fileEnv = parseEnvFile(resolve(".env.local"));
  const databaseId = requireD1DatabaseId(fileEnv);
  const names = requireGeneratedNames(fileEnv);

  writeGeneratedConfig(CONFIGS.app.source, CONFIGS.app.generated, databaseId, names);
  writeGeneratedConfig(
    CONFIGS.bookingDo.source,
    CONFIGS.bookingDo.generated,
    databaseId,
    names,
  );
  return CONFIGS;
}

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function deployBuiltWorkers(configs: typeof CONFIGS): void {
  run("bunx", ["wrangler", "deploy", "--config", configs.bookingDo.generated]);
  run("bunx", ["opennextjs-cloudflare", "deploy", "--config", configs.app.generated]);
}

const command = process.argv[2] as Command | undefined;
if (!command) {
  throw new Error(
    "Usage: bun run scripts/cloudflare.ts <db:migrate:remote|build|deploy:do|deploy>",
  );
}

const configs = writeGeneratedConfigs();

switch (command) {
  case "db:migrate:remote":
    run("bunx", [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "hytta",
      "--remote",
      "--config",
      configs.app.generated,
    ]);
    break;

  case "build":
    run("bunx", ["opennextjs-cloudflare", "build", "--config", configs.app.generated]);
    break;

  case "deploy:do":
    run("bunx", ["wrangler", "deploy", "--config", configs.bookingDo.generated]);
    break;

  case "deploy":
    deployBuiltWorkers(configs);
    break;

  default:
    throw new Error(`Unknown Cloudflare command: ${String(command)}`);
}
