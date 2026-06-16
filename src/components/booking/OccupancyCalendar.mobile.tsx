'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { nb, enGB } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchableSelect } from './SearchableSelect';
import { DayDetailsDialog } from './DayDetailsDialog';
import {
  CustomDayButton,
  OccupancyContext,
  RANGE_CONTINUATION_CLASSNAMES,
  RoomLegend,
  addMonths,
  getRangeContinuationModifiers,
  startOfMonth,
  startOfToday,
  useOccupancyCalendar,
  type OccupancyCalendarProps,
} from './OccupancyCalendar.shared';

/**
 * Mobile occupancy calendar — narrower day cells (7×~36 px ≈ 252 px) and a
 * tap-friendly month/year picker. Same selection contract as the desktop
 * variant.
 */
export function OccupancyCalendar(props: OccupancyCalendarProps) {
  const { selection, rooms, disablePast = true } = props;
  const t = useTranslations('Book');
  const locale = useLocale();
  const dpLocale = locale === 'en-GB' ? enGB : nb;

  const ctrl = useOccupancyCalendar(props);
  const { month, setMonth, occupancy, fullyBookedSet, detailsDate, detailsAssignments } = ctrl;

  const occupancyContext = React.useMemo(
    // Cells are now responsive (1/7 of the grid); ~48 is a representative width
    // for sizing the room icons (the icon size is clamped anyway).
    () => ({ byDay: occupancy, rooms, fullyBooked: fullyBookedSet, cellWidth: 48 }),
    [occupancy, rooms, fullyBookedSet],
  );

  const dayPicker =
    selection.mode === 'range' ? (
      <DayPicker
        mode="range"
        selected={selection.value}
        modifiers={getRangeContinuationModifiers(selection.value)}
        modifiersClassNames={RANGE_CONTINUATION_CLASSNAMES}
        onSelect={(_next, triggerDate) => ctrl.handleDayClick(triggerDate)}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={1}
        weekStartsOn={1}
        locale={dpLocale}
        disabled={disablePast ? [{ before: new Date() }] : undefined}
        components={{ DayButton: CustomDayButton }}
        className={cn('rdp-root mx-auto w-full max-w-sm')}
        classNames={MOBILE_CLASSNAMES}
      />
    ) : (
      <DayPicker
        mode="single"
        selected={selection.value}
        onSelect={(_next, triggerDate) => ctrl.handleDayClick(triggerDate)}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={1}
        weekStartsOn={1}
        locale={dpLocale}
        disabled={disablePast ? [{ before: new Date() }] : undefined}
        components={{ DayButton: CustomDayButton }}
        className={cn('rdp-root mx-auto w-full max-w-sm')}
        classNames={MOBILE_CLASSNAMES}
      />
    );

  return (
    <OccupancyContext.Provider value={occupancyContext}>
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card),var(--color-moss-100)_8%)] p-3">
        <CalendarHeader
          month={month}
          onMonthChange={setMonth}
          locale={locale}
          monthLabel={t('monthLabel')}
          yearLabel={t('yearLabel')}
          prevLabel={t('prevMonth')}
          nextLabel={t('nextMonth')}
          todayLabel={t('today')}
        />

        {dayPicker}

        <RoomLegend rooms={rooms} legendTitle={t('legendOccupied')} />
        <p className="text-[10px] leading-snug text-[var(--muted-foreground)]">
          {t('fullyBookedNote')}
        </p>
      </div>
      {detailsDate && (
        <DayDetailsDialog
          date={detailsDate}
          assignments={detailsAssignments}
          rooms={rooms}
          onClose={() => ctrl.setDetailsDate(null)}
        />
      )}
    </OccupancyContext.Provider>
  );
}

// Default day-picker uses a `<table>` with `border-collapse` so adjacent
// cells abut — that's what makes the range fill connect visually. We only
// override sizes; layout itself is left to day-picker.
const MOBILE_CLASSNAMES = {
  months: 'flex w-full',
  month: 'w-full',
  // Full-width table with seven equal columns, so the grid fills the available
  // width instead of a fixed cell size.
  month_grid: 'w-full table-fixed',
  month_caption: 'hidden',
  nav: 'hidden',
  weekday:
    'text-[var(--muted-foreground)] text-[10px] font-medium uppercase tracking-wide pb-1',
  day: 'h-10 p-0 text-center text-sm align-middle relative',
  day_button:
    'inline-flex h-10 w-full items-center justify-center rounded-md transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
  // Selected/range days keep their green on hover, just a shade darker (the
  // default muted-bg hover would wipe the green out).
  selected:
    '[&_button]:bg-[var(--primary)] [&_button]:text-[var(--primary-foreground)] [&_button]:hover:bg-[color-mix(in_oklch,var(--primary),black_20%)]',
  range_start:
    '[&_button]:bg-[var(--primary)] [&_button]:text-[var(--primary-foreground)] [&_button]:hover:bg-[color-mix(in_oklch,var(--primary),black_20%)] [&_button]:rounded-l-md [&_button]:rounded-r-none [&:last-child_button]:rounded-r-md',
  range_end:
    '[&_button]:bg-[var(--primary)] [&_button]:text-[var(--primary-foreground)] [&_button]:hover:bg-[color-mix(in_oklch,var(--primary),black_20%)] [&_button]:rounded-r-md [&_button]:rounded-l-none [&:first-child_button]:rounded-l-md',
  range_middle:
    '[&_button]:bg-[color-mix(in_oklch,var(--primary),transparent_60%)] [&_button]:text-[var(--foreground)] [&_button]:hover:bg-[color-mix(in_oklch,color-mix(in_oklch,var(--primary),transparent_60%),black_20%)] [&_button]:rounded-none [&:first-child_button]:rounded-l-md [&:last-child_button]:rounded-r-md',
  today: 'hytta-today',
  disabled: 'opacity-30',
  outside: 'opacity-0',
};

function CalendarHeader({
  month,
  onMonthChange,
  locale,
  monthLabel,
  yearLabel,
  prevLabel,
  nextLabel,
  todayLabel,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  locale: string;
  monthLabel: string;
  yearLabel: string;
  prevLabel: string;
  nextLabel: string;
  todayLabel: string;
}) {
  const today = startOfToday();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Full month names for the month select.
  const monthOptions = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      name: fmt.format(new Date(2024, i, 1)),
    }));
  }, [locale]);

  // Suggested years: today + next 5. Past / far-future years stay reachable by
  // typing into the field (`allowCustom`).
  const baseYear = today.getFullYear();
  const yearOptions = React.useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: String(baseYear + i),
        name: String(baseYear + i),
      })),
    [baseYear],
  );

  const setMonthIdx = (idx: number) => onMonthChange(new Date(month.getFullYear(), idx, 1));
  const setYear = (y: number) => onMonthChange(new Date(y, month.getMonth(), 1));

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
      {/* Same width as the day grid below (full width, capped at max-w-sm so it
          doesn't stretch on a wide/landscape card). Month + year selects: the
          month fills the row, the year is fixed. */}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            label={monthLabel}
            options={monthOptions}
            value={String(month.getMonth())}
            onChange={(id) => setMonthIdx(Number(id))}
            allowCustom={(q) => {
              const n = Number(q);
              if (!Number.isInteger(n) || n < 1 || n > 12) return null;
              return String(n - 1);
            }}
          />
        </div>
        <div className="w-20 shrink-0">
          <SearchableSelect
            label={yearLabel}
            options={yearOptions}
            value={String(month.getFullYear())}
            onChange={(id) => setYear(Number(id))}
            allowCustom={(q) => {
              const n = Number(q);
              if (!Number.isInteger(n) || n < 1970 || n > 2999) return null;
              return String(n);
            }}
          />
        </div>
      </div>

      {/* Step a month at a time, or jump back to the current month. The Today
          button flexes to fill the row, so it spans the grid width too. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={prevLabel}
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] active:bg-[var(--muted)]"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onMonthChange(startOfMonth(today))}
          disabled={isCurrentMonth}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-xs font-medium active:bg-[var(--muted)] disabled:opacity-40"
        >
          {todayLabel}
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] active:bg-[var(--muted)]"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
