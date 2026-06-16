'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  DEMO_RESET_INTERVAL_MS,
  DEMO_WARNING_OFFSETS_MS,
} from '@/lib/demo-constants';

export function DemoModeToasts({ resetAt }: { resetAt: number }) {
  React.useEffect(() => {
    toast.info('Demo mode is active. Data resets every hour.', {
      id: 'demo-mode-active',
      duration: 8000,
    });

    const timers: number[] = [];
    const scheduleResetCycle = (cycleResetAt: number) => {
      for (const offset of DEMO_WARNING_OFFSETS_MS) {
        const delay = cycleResetAt - Date.now() - offset;
        if (delay < 0) continue;
        const minutes = Math.round(offset / 60_000);
        timers.push(
          window.setTimeout(() => {
            toast.warning(`Demo data resets in ${minutes} minute${minutes === 1 ? '' : 's'}.`, {
              id: `demo-reset-${cycleResetAt}-${minutes}`,
              duration: 10000,
            });
          }, delay),
        );
      }

      const resetDelay = cycleResetAt - Date.now();
      if (resetDelay >= 0) {
        timers.push(
          window.setTimeout(() => {
            toast.info('Demo data has reset to the default state.', {
              id: `demo-reset-done-${cycleResetAt}`,
              duration: 8000,
            });
          }, resetDelay),
        );
      }

      timers.push(
        window.setTimeout(
          () => scheduleResetCycle(cycleResetAt + DEMO_RESET_INTERVAL_MS),
          Math.max(0, cycleResetAt - Date.now() + 1000),
        ),
      );
    };

    scheduleResetCycle(resetAt);

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [resetAt]);

  return null;
}
