import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzleFor, type DB } from '@/db/client';
import { ReservationService } from '@/lib/booking/reservation-service';
import { createConflictChecker } from '@/lib/booking/conflicts';

/**
 * Test database backed by a fresh in-memory Miniflare D1 instance — the same
 * engine the app runs on, so tests exercise the real async D1 code path. Each
 * `makeTestDb()` gets its own isolated database; call `cleanup()` to dispose the
 * worker.
 */
const MIGRATIONS_DIR = resolve(process.cwd(), 'src/db/migrations');
const MIGRATION_STATEMENTS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
  .join('\n--> statement-breakpoint\n')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

export interface TestSeedIds {
  userId: string;
  otherUserId: string;
  rooms: { BLUE: string; YELLOW: string; RED: string; OUTDOORS: string };
  beds: { RED_DOUBLE: string; RED_SINGLE_1: string; RED_SINGLE_2: string };
}

export interface TestDb {
  db: DB;
  /** Raw D1 handle for direct SQL in tests (replaces the old bun:sqlite `raw`). */
  d1: D1Database;
  /** Convenience: run one or more `\n`-separated statements (no params). */
  exec: (sql: string) => Promise<void>;
  service: ReservationService;
  checker: ReturnType<typeof createConflictChecker>;
  /** Inserts the canonical seed (rooms + beds + two users) and returns ids. */
  seed: () => Promise<TestSeedIds>;
  cleanup: () => Promise<void>;
}

export async function makeTestDb(): Promise<TestDb> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    d1Databases: ['DB'],
  });
  const d1 = (await mf.getD1Database('DB')) as unknown as D1Database;

  for (const stmt of MIGRATION_STATEMENTS) {
    await d1.prepare(stmt).run();
  }

  const db = drizzleFor(d1);
  const service = new ReservationService(db);
  const checker = createConflictChecker(db);

  return {
    db,
    d1,
    exec: async (sql: string) => {
      await d1.exec(sql);
    },
    service,
    checker,
    seed: async () => {
      const userId = 'user_test_1';
      const otherUserId = 'user_test_2';
      const roomIds = { BLUE: 'r_blue', YELLOW: 'r_yellow', RED: 'r_red', OUTDOORS: 'r_outdoors' };
      const bedIds = {
        RED_DOUBLE: 'b_red_double',
        RED_SINGLE_1: 'b_red_single_1',
        RED_SINGLE_2: 'b_red_single_2',
      };

      await d1.batch([
        // Users — two so tests can place different people in parallel rooms.
        d1.prepare(
          `INSERT INTO user (id, name, email, password_hash, created_at) VALUES
            (?, 'Test One', 'test1@example.com', 'x', strftime('%s','now')),
            (?, 'Test Two', 'test2@example.com', 'x', strftime('%s','now'))`,
        ).bind(userId, otherUserId),
        // Rooms
        d1
          .prepare(
            `INSERT INTO room (id, name_nb, name_en, icon, color, capacity_mode, slot_count, created_at) VALUES
            (?, 'Blå',      'Blue',     'circle',   '#3b82f6', 'BEDS',  NULL, strftime('%s','now')),
            (?, 'Gul',      'Yellow',   'square',   '#eab308', 'BEDS',  NULL, strftime('%s','now')),
            (?, 'Rød',      'Red',      'triangle', '#e11d48', 'BEDS',  NULL, strftime('%s','now')),
            (?, 'Utendørs', 'Outdoors', 'tent',     '#65a30d', 'SLOTS', NULL, strftime('%s','now'))`,
          )
          .bind(roomIds.BLUE, roomIds.YELLOW, roomIds.RED, roomIds.OUTDOORS),
        // Beds
        d1
          .prepare(
            `INSERT INTO bed (id, room_id, kind, label, created_at) VALUES
            (?, ?, 'DOUBLE', 'RED-DOUBLE',   strftime('%s','now')),
            (?, ?, 'SINGLE', 'RED-SINGLE-1', strftime('%s','now')),
            (?, ?, 'SINGLE', 'RED-SINGLE-2', strftime('%s','now'))`,
          )
          .bind(
            bedIds.RED_DOUBLE,
            roomIds.RED,
            bedIds.RED_SINGLE_1,
            roomIds.RED,
            bedIds.RED_SINGLE_2,
            roomIds.RED,
          ),
      ]);

      return { userId, otherUserId, rooms: roomIds, beds: bedIds };
    },
    cleanup: () => mf.dispose(),
  };
}

/**
 * Returns a YYYY-MM-DD date offset N days from today. Bypasses the
 * "no past dates" validator inside the service for tests that need fixed
 * positions; tests that want validation should use future offsets.
 */
export function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
