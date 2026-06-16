import { env } from '@/lib/env';
import { DEMO_RESET_INTERVAL_MS } from '@/lib/demo-constants';

export interface DemoResetInfo {
  generation: number;
  resetAt: number;
  msUntilReset: number;
}

export function isDemoMode(): boolean {
  const value = env.DEMO as boolean | string;
  return value === true || value === 'true';
}

export function getDemoResetInfo(now = Date.now()): DemoResetInfo {
  const generation = Math.floor(now / DEMO_RESET_INTERVAL_MS);
  const resetAt = (generation + 1) * DEMO_RESET_INTERVAL_MS;
  return {
    generation,
    resetAt,
    msUntilReset: Math.max(0, resetAt - now),
  };
}
