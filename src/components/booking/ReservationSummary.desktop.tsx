'use client';

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
 * Desktop summary — sticky card centred over the booking flow. Truncates
 * the description on a single line; the whole assembly stays inside the
 * scrolling content area.
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
  const t = useTranslations('Book');
  const tErr = useTranslations('Errors');
  const locale = useLocale();

  const days = startDate && endDate ? daysInRange(startDate, endDate) : 0;
  const count = targetCount(selection);
  const ready = !!startDate && !!endDate && days > 0 && count > 0 && !isPending;

  const description = ready
    ? describeSelection(selection, rooms, users, t('fullCottage'), locale)
    : t('summaryNoSelection');

  return (
    <div className="sticky bottom-4 z-30 mx-auto w-full max-w-xl">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/95 p-4 shadow-lg backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
            <CalendarCheck className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {ready ? t('daysCount', { days }) : t('summaryTitle')}
            </p>
            <p className="truncate text-sm font-medium">{description}</p>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 p-2 text-xs text-[var(--destructive)]">
            {error === 'CONFLICT' ? tErr('conflict') : tErr('generic')}
          </p>
        )}

        <Button className="mt-3 w-full" size="lg" disabled={!ready} onClick={onConfirm}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel ?? t('confirmCta')}
        </Button>
      </div>
    </div>
  );
}
