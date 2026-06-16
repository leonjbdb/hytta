'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { OccupantRef } from '@/lib/booking/types';
import { formatStay } from '@/lib/booking/format-stay';

/**
 * "Booked by multiple people" label with a hover/tap tooltip listing WHO holds
 * the bed/slot and WHEN. Shown wherever a single unit is shared by several
 * distinct people across the booked range (e.g. two back-to-back stays), where
 * one profile badge would be misleading.
 *
 * Desktop reveals the tooltip on hover; touch devices have no hover, so the
 * label is also tappable — a tap toggles it, blur/Escape dismisses it (mirrors
 * PersonBadge).
 */
export function BookedByMultiple({ occupants }: { occupants: OccupantRef[] }) {
  const t = useTranslations('Book');
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const tooltipVis = open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={t('bedTakenMultiple')}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((v) => !v);
        } else if (e.key === 'Escape') {
          setOpen(false);
        }
      }}
      className="group relative inline-flex cursor-pointer select-none items-center gap-1 px-1 text-xs text-[var(--muted-foreground)]"
    >
      {t('bedTakenMultiple')}
      <span
        role="tooltip"
        className={
          'pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-left text-xs font-normal text-[var(--foreground)] shadow-md transition-opacity ' +
          tooltipVis
        }
      >
        <ul className="flex flex-col gap-0.5">
          {occupants.map((o, i) => (
            <li key={`${o.name}-${o.startDate}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-medium">{o.name}</span>
              <span className="text-[var(--muted-foreground)]">{formatStay(o, locale)}</span>
            </li>
          ))}
        </ul>
      </span>
    </span>
  );
}
