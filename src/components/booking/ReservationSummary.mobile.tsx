'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ReservationSummaryBody } from './ReservationSummary.body';
import type { ReservationSummaryProps } from './ReservationSummary.shared';

/**
 * Mobile summary — portaled into the layout's `#hytta-bottom-slot` which sits
 * *below* the scroll container in the flex column. Result: the scrollbar lives
 * entirely between the header and the top of this sheet, content can't scroll
 * behind the sheet, and we don't need `position: fixed` (no overlap, no
 * padding-hack).
 *
 * The sheet hosts the shared accordion body (default closed) so a large booking
 * collapses to a one-line summary and expands in place — its detail panel caps
 * its own height and scrolls.
 *
 * On first render the portal target may not exist yet (SSR), so we gate on a
 * `React.useEffect`-set ref before rendering.
 */
export function ReservationSummary(props: ReservationSummaryProps) {
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setTarget(document.getElementById('hytta-bottom-slot'));
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="border-t border-[var(--border)] bg-[var(--hytta-calendar-bg)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur">
      <ReservationSummaryBody {...props} />
    </div>,
    target,
  );
}
