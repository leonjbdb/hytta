import { getDemoResetInfo } from '@/lib/demo-mode';
import {
  createDemoState,
  DEMO_STATE_VERSION,
  type DemoState,
} from './demo-state';

const DEMO_CACHE_ORIGIN = 'https://hytta.local';
const DEMO_CACHE_PREFIX = '/__hytta_demo_state__';
const DEMO_CACHE_NAME = 'hytta-demo-state';

interface CachedDemoState {
  generation: number;
  state: DemoState;
}

// `caches.default` is Cloudflare's non-standard extension; `.open()` is the
// spec CacheStorage method. We try both because which one is reachable depends
// on the runtime context.
type DemoCacheStorage = CacheStorage & { default?: Cache };

let writeQueue: Promise<void> = Promise.resolve();

/**
 * Per-isolate fallback used when the Cloudflare Cache API isn't reachable in the
 * current context (e.g. `caches.default` is not exposed during OpenNext SSR, or
 * a cache operation throws). Under the Worker's stateless execution model this
 * does not persist across requests — reads still rebuild deterministically from
 * the seed, and writes (demo bookings) only live for the current request. When
 * the Cache API *is* reachable, the cache path keeps the full hourly-shared
 * persistence instead.
 */
const memoryStore = new Map<string, string>();

function stateKey(generation: number): string {
  return `v${DEMO_STATE_VERSION}:${generation}`;
}

function demoStateRequest(generation: number): Request {
  return new Request(
    `${DEMO_CACHE_ORIGIN}${DEMO_CACHE_PREFIX}/v${DEMO_STATE_VERSION}/${generation}`,
    { method: 'GET' },
  );
}

function demoStateResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
}

/**
 * Resolve a Cache for cross-request demo state. Prefer Cloudflare's
 * `caches.default`; fall back to a named cache (`caches.open`) when `.default`
 * isn't exposed in the current context. Returns null when no Cache API is
 * reachable, leaving callers on the in-memory store. Never throws.
 */
async function getDemoCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  const api = caches as DemoCacheStorage;
  try {
    if (api.default) return api.default;
  } catch {
    // Accessing `.default` can throw in some runtime contexts — fall through.
  }
  try {
    if (typeof api.open === 'function') return await api.open(DEMO_CACHE_NAME);
  } catch {
    // Named cache unavailable — fall through to the in-memory store.
  }
  return null;
}

function parseCachedState(json: string, generation: number): DemoState {
  const payload = JSON.parse(json) as CachedDemoState;
  if (payload.generation !== generation) {
    throw new Error(
      `[demo] Cached state generation mismatch: expected ${generation}, got ${payload.generation}.`,
    );
  }
  return payload.state;
}

async function readCachedState(generation: number): Promise<DemoState | null> {
  const cache = await getDemoCache();
  if (cache) {
    try {
      const response = await cache.match(demoStateRequest(generation));
      return response ? parseCachedState(await response.text(), generation) : null;
    } catch (err) {
      console.warn('[demo] Cache read failed; using in-memory store:', err);
    }
  }
  const json = memoryStore.get(stateKey(generation));
  return json ? parseCachedState(json, generation) : null;
}

async function writeCachedState(generation: number, state: DemoState): Promise<void> {
  const json = JSON.stringify({ generation, state } satisfies CachedDemoState);
  const cache = await getDemoCache();
  if (cache) {
    try {
      await cache.put(demoStateRequest(generation), demoStateResponse(json));
      return;
    } catch (err) {
      console.warn('[demo] Cache write failed; using in-memory store:', err);
    }
  }
  memoryStore.set(stateKey(generation), json);
}

async function deleteCachedState(generation: number): Promise<void> {
  memoryStore.delete(stateKey(generation));
  const cache = await getDemoCache();
  if (!cache) return;
  try {
    await cache.delete(demoStateRequest(generation));
  } catch {
    // Best-effort cleanup of the previous generation; ignore failures.
  }
}

export async function getDemoState(): Promise<DemoState> {
  const { generation } = getDemoResetInfo();
  const cached = await readCachedState(generation);
  if (cached) return cached;

  const state = createDemoState();
  await writeCachedState(generation, state);
  await deleteCachedState(generation - 1);
  return state;
}

export async function setDemoState(state: DemoState): Promise<void> {
  const { generation } = getDemoResetInfo();
  await writeCachedState(generation, state);
}

export async function updateDemoState<T>(
  update: (state: DemoState) => T | Promise<T>,
): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await getDemoState();
    const result = await update(state);
    await setDemoState(state);
    return result;
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
