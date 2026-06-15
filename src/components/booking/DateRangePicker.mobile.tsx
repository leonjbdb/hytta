'use client';

import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { useTranslations } from 'next-intl';
import { daysInRange, toISODate } from '@/lib/utils';
import { OccupancyCalendar } from './OccupancyCalendar.mobile';
import type { OccupancyCalendarRoom } from './OccupancyCalendar.shared';

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  rooms: OccupancyCalendarRoom[];
}

/**
 * Mobile date-range picker. Wraps the generic mobile `OccupancyCalendar`
 * (range mode) and surfaces the day count once a range is set.
 *
 * Mobile drops the dual `<input type="date">` row that desktop carries —
 * the calendar is the primary input and native date pickers eat too much
 * vertical space on a phone.
 */
export function DateRangePicker({ value, onChange, rooms }: DateRangePickerProps) {
  const t = useTranslations('Book');

  const days =
    value?.from && value?.to ? daysInRange(toISODate(value.from), toISODate(value.to)) : 0;

  return (
    <div className="flex flex-col gap-3">
      <OccupancyCalendar
        selection={{ mode: 'range', value, onChange }}
        rooms={rooms}
      />
      {days > 0 && (
        <p className="rounded-md border border-[var(--border)] bg-[var(--card)]/70 p-2 text-center text-xs text-[var(--muted-foreground)]">
          {t('daysCount', { days })}
        </p>
      )}
    </div>
  );
}
