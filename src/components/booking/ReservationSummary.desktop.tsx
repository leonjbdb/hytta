'use client';

import { ReservationSummaryBody } from './ReservationSummary.body';
import type { ReservationSummaryProps } from './ReservationSummary.shared';

/**
 * Desktop summary — sticky card spanning the full width of the booking flow
 * (both the calendar and picker columns). The card holds a collapsible
 * accordion (default closed) that expands to show every room, bed and person;
 * the whole assembly stays inside the scrolling content area.
 */
export function ReservationSummary(props: ReservationSummaryProps) {
  return (
    <div className="sticky bottom-4 z-30 w-full">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/95 p-4 shadow-lg backdrop-blur">
        <ReservationSummaryBody {...props} />
      </div>
    </div>
  );
}
