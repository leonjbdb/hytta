import { getDemoResetInfo } from '@/lib/demo-mode';
import {
  createDemoState,
  DEMO_STATE_VERSION,
  type DemoState,
} from './demo-state';

const DEMO_CACHE_ORIGIN = 'https://hytta.local';
const DEMO_CACHE_PREFIX = '/__hytta_demo_state__';
const LOCAL_DEMO_CACHE_KEY = '__hyttaDemoLocalCache';

interface CachedDemoState {
  generation: number;
  state: DemoState;
}

type CloudflareCacheStorage = CacheStorage & {
  default: Cache;
};

type LocalDemoCacheGlobal = typeof globalThis & {
  __hyttaDemoLocalCache?: Map<string, string>;
};

let writeQueue: Promise<void> = Promise.resolve();

function demoStateRequest(generation: number): Request {
  return new Request(
    `${DEMO_CACHE_ORIGIN}${DEMO_CACHE_PREFIX}/v${DEMO_STATE_VERSION}/${generation}`,
    { method: 'GET' },
  );
}

function demoStateResponse(payload: CachedDemoState): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function getCloudflareDemoCache(): Cache | null {
  if (typeof caches === 'undefined') return null;
  return (caches as CloudflareCacheStorage).default;
}

function getLocalDemoCache(): Map<string, string> {
  const nodeEnv =
    typeof process === 'undefined' ? 'production' : process.env.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error('[demo] Cache API is required when DEMO=true.');
  }

  const globalStore = globalThis as LocalDemoCacheGlobal;
  globalStore[LOCAL_DEMO_CACHE_KEY] ??= new Map<string, string>();
  return globalStore[LOCAL_DEMO_CACHE_KEY];
}

function localDemoCacheKey(generation: number): string {
  return `v${DEMO_STATE_VERSION}:${generation}`;
}

async function readCachedState(generation: number): Promise<DemoState | null> {
  const cache = getCloudflareDemoCache();
  if (!cache) {
    const json = getLocalDemoCache().get(localDemoCacheKey(generation));
    if (!json) return null;
    const payload = JSON.parse(json) as CachedDemoState;
    if (payload.generation !== generation) {
      throw new Error(
        `[demo] Cached state generation mismatch: expected ${generation}, got ${payload.generation}.`,
      );
    }
    return payload.state;
  }

  const response = await cache.match(demoStateRequest(generation));
  if (!response) return null;

  const payload = (await response.json()) as CachedDemoState;
  if (payload.generation !== generation) {
    throw new Error(
      `[demo] Cached state generation mismatch: expected ${generation}, got ${payload.generation}.`,
    );
  }
  return payload.state;
}

async function writeCachedState(generation: number, state: DemoState): Promise<void> {
  const payload = { generation, state } satisfies CachedDemoState;
  const cache = getCloudflareDemoCache();
  if (!cache) {
    getLocalDemoCache().set(localDemoCacheKey(generation), JSON.stringify(payload));
    return;
  }

  await cache.put(
    demoStateRequest(generation),
    demoStateResponse(payload),
  );
}

async function deleteCachedState(generation: number): Promise<void> {
  const cache = getCloudflareDemoCache();
  if (!cache) {
    getLocalDemoCache().delete(localDemoCacheKey(generation));
    return;
  }

  await cache.delete(demoStateRequest(generation));
}

export async function getDemoState(): Promise<DemoState> {
  try {
    const { generation } = getDemoResetInfo();
    const cached = await readCachedState(generation);
    if (cached) return cached;

    const state = await createDemoState();
    await writeCachedState(generation, state);
    await deleteCachedState(generation - 1);
    return state;
  } catch (err) {
    console.error('[demo][diag] getDemoState failed:', err);
    throw err;
  }
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
