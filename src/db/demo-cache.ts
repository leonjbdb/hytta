import { getDemoResetInfo } from '@/lib/demo-mode';
import { createDemoState, type DemoState } from './demo-state';

const DEMO_CACHE_ORIGIN = 'https://hytta.local';
const DEMO_CACHE_PREFIX = '/__hytta_demo_state__';

interface CachedDemoState {
  generation: number;
  state: DemoState;
}

type CloudflareCacheStorage = CacheStorage & {
  default: Cache;
};

let writeQueue: Promise<void> = Promise.resolve();

function demoStateRequest(generation: number): Request {
  return new Request(`${DEMO_CACHE_ORIGIN}${DEMO_CACHE_PREFIX}/${generation}`, {
    method: 'GET',
  });
}

function demoStateResponse(payload: CachedDemoState): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function getDemoCache(): Cache {
  if (typeof caches === 'undefined') {
    throw new Error('[demo] Cache API is required when DEMO=true.');
  }
  return (caches as CloudflareCacheStorage).default;
}

async function readCachedState(generation: number): Promise<DemoState | null> {
  const response = await getDemoCache().match(demoStateRequest(generation));
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
  await getDemoCache().put(
    demoStateRequest(generation),
    demoStateResponse({ generation, state }),
  );
}

export async function getDemoState(): Promise<DemoState> {
  const { generation } = getDemoResetInfo();
  const cached = await readCachedState(generation);
  if (cached) return cached;

  const state = await createDemoState();
  await writeCachedState(generation, state);
  await getDemoCache().delete(demoStateRequest(generation - 1));
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
