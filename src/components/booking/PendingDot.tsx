'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

/**
 * Small amber marker for a room/bed/cottage that has booking requests awaiting
 * approval. Shows the count; hover (desktop) or tap (mobile) reveals who is in
 * the queue. Tapping the dot never toggles the surrounding room checkbox or
 * starts a drag — it stops the event.
 */
export function PendingDot({ names }: { names: string[] }) {
  const t = useTranslations('Book');
  const [open, setOpen] = React.useState(false);
  if (names.length === 0) return null;
  const tooltipVis = open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`${t('pendingApproval')}: ${names.join(', ')}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onBlur={() => setOpen(false)}
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--color-partial),white_55%)] text-[10px] font-semibold text-[var(--color-clay-800)]"
      >
        {names.length}
      </button>
      <span
        role="tooltip"
        className={
          'pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-[14rem] -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-left text-xs font-normal shadow-md transition-opacity ' +
          tooltipVis
        }
      >
        <span className="mb-0.5 block font-medium text-[var(--foreground)]">
          {t('pendingApproval')}
        </span>
        <span className="block text-[var(--muted-foreground)]">{names.join(', ')}</span>
      </span>
    </span>
  );
}
