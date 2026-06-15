'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { daysInRange } from '@/lib/utils';
import {
  describeSelection,
  targetCount,
  type ReservationSummaryProps,
} from './ReservationSummary.shared';

/**
 * Mobile summary — portaled into the layout's `#hytta-bottom-slot`
 * which sits *below* the scroll container in the flex column. Result:
 * the scrollbar lives entirely between the header and the top of this
 * sheet, content can't scroll behind the sheet, and we don't need
 * `position: fixed` (no overlap, no padding-hack).
 *
 * On first render the portal target may not exist yet (SSR), so we
 * gate on a `React.useEffect`-set ref before rendering.
 */
export function ReservationSummary({
  startDate,
  endDate,
  selection,
  rooms,
  users,
  isPending,
  error,
  onConfirm,
  submitLabel,
}: ReservationSummaryProps) {
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setTarget(document.getElementById('hytta-bottom-slot'));
  }, []);

  const t = useTranslations('Book');
  const tErr = useTranslations('Errors');
  const locale = useLocale();

  const days = startDate && endDate ? daysInRange(startDate, endDate) : 0;
  const count = targetCount(selection);
  const ready = !!startDate && !!endDate && days > 0 && count > 0 && !isPending;

  const description = ready
    ? describeSelection(selection, rooms, users, t('fullCottage'), locale)
    : t('summaryNoSelection');

  if (!target) return null;

  return createPortal(
    <div className="border-t border-[var(--border)] bg-[var(--card)]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
          <CalendarCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {ready ? t('daysCount', { days }) : t('summaryTitle')}
          </p>
          <p className="line-clamp-2 text-sm font-medium">{description}</p>
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 p-2 text-xs text-[var(--destructive)]">
          {error === 'CONFLICT' ? tErr('conflict') : tErr('generic')}
        </p>
      )}

      <Button className="mt-2 w-full" size="lg" disabled={!ready} onClick={onConfirm}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitLabel ?? t('confirmCta')}
      </Button>
    </div>,
    target,
  );
}
