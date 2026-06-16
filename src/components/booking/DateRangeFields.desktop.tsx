'use client';

import type { DateRange } from 'react-day-picker';
import { useTranslations } from 'next-intl';
import { cn, daysInRange, toISODate } from '@/lib/utils';
import { parseISODate, startOfMonth, startOfToday } from './OccupancyCalendar.shared';

interface DateRangeFieldsProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  /** Typing a start date scrolls the (separately rendered) calendar to it. */
  onMonthChange: (month: Date) => void;
  className?: string;
}

/**
 * Desktop start/end date card for the booking flow: the two native date inputs
 * plus a day-count line. The occupancy calendar is rendered separately by the
 * page so this card can share a height-matched grid row with the booking-mode
 * controls; typing a start date scrolls that calendar via `onMonthChange`.
 */
export function DateRangeFields({ value, onChange, onMonthChange, className }: DateRangeFieldsProps) {
  const t = useTranslations('Book');

  const startIso = value?.from ? toISODate(value.from) : '';
  const endIso = value?.to ? toISODate(value.to) : '';
  const todayIso = toISODate(startOfToday());
  const minEndIso = value?.from ? toISODate(value.from) : todayIso;

  const handleStartInput = (iso: string) => {
    const d = parseISODate(iso);
    if (!d) {
      onChange(undefined);
      return;
    }
    const existingTo = value?.to;
    const nextTo = existingTo && existingTo >= d ? existingTo : undefined;
    onChange({ from: d, to: nextTo });
    onMonthChange(startOfMonth(d));
  };

  const handleEndInput = (iso: string) => {
    const d = parseISODate(iso);
    if (!d || !value?.from) return;
    if (d < value.from) return;
    onChange({ from: value.from, to: d });
  };

  const days =
    value?.from && value?.to ? daysInRange(toISODate(value.from), toISODate(value.to)) : 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--card)]/70 p-3 text-sm',
        className,
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          {t('startDateLabel')}
          <input
            type="date"
            value={startIso}
            min={todayIso}
            onChange={(e) => handleStartInput(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          {t('endDateLabel')}
          <input
            type="date"
            value={endIso}
            min={minEndIso}
            disabled={!value?.from}
            onChange={(e) => handleEndInput(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          />
        </label>
      </div>
      {days > 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">{t('daysCount', { days })}</p>
      )}
    </div>
  );
}
