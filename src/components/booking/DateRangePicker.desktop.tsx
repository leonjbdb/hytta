'use client';

import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { useTranslations } from 'next-intl';
import { daysInRange, toISODate } from '@/lib/utils';
import { OccupancyCalendar } from './OccupancyCalendar.desktop';
import {
  parseISODate,
  startOfMonth,
  startOfToday,
  type OccupancyCalendarRoom,
} from './OccupancyCalendar.shared';

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  rooms: OccupancyCalendarRoom[];
}

/**
 * Desktop date-range picker for the booking flow. Wraps the generic
 * `OccupancyCalendar` (range mode) with the start/end native date inputs
 * and day-count badge — features specific to the booking workflow.
 */
export function DateRangePicker({ value, onChange, rooms }: DateRangePickerProps) {
  const t = useTranslations('Book');

  // Owned here so typing into the start input can scroll the calendar.
  const [month, setMonth] = React.useState<Date>(() => startOfMonth(new Date()));

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
    setMonth(startOfMonth(d));
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
    <div className="flex flex-col gap-3">
      <OccupancyCalendar
        selection={{ mode: 'range', value, onChange }}
        rooms={rooms}
        month={month}
        onMonthChange={setMonth}
      />

      <div className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--card)]/70 p-3 text-sm">
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
          <p className="text-xs text-[var(--muted-foreground)]">
            {t('daysCount', { days })}
          </p>
        )}
      </div>
    </div>
  );
}
