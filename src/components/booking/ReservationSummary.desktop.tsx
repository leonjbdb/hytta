'use client';

import { ReservationSummaryBody } from './ReservationSummary.body';
import type { ReservationSummaryProps } from './ReservationSummary.shared';

/**
 * Desktop summary — sticky card centred over the booking flow. The card holds
 * a collapsible accordion (default closed) that expands to show every room,
 * bed and person; the whole assembly stays inside the scrolling content area.
 */
export function ReservationSummary(props: ReservationSummaryProps) {
  return (
    <div className="sticky bottom-4 z-30 mx-auto w-full max-w-xl">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/95 p-4 shadow-lg backdrop-blur">
        <ReservationSummaryBody {...props} />
      </div>
    </div>
  );
}
