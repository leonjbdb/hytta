'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { nb, enGB } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DayDetailsDialog } from './DayDetailsDialog';
import {
  CustomDayButton,
  OccupancyContext,
  RoomLegend,
  addMonths,
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
    () => ({ byDay: occupancy, rooms, fullyBooked: fullyBookedSet }),
    [occupancy, rooms, fullyBookedSet],
  );

  const dayPicker =
    selection.mode === 'range' ? (
      <DayPicker
        mode="range"
        selected={selection.value}
        onSelect={(_next, triggerDate) => ctrl.handleDayClick(triggerDate)}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={1}
        weekStartsOn={1}
        locale={dpLocale}
        disabled={disablePast ? [{ before: new Date() }] : undefined}
        components={{ DayButton: CustomDayButton }}
        className={cn('rdp-root mx-auto')}
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
        className={cn('rdp-root mx-auto')}
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
  months: 'flex',
  month_caption: 'hidden',
  nav: 'hidden',
  weekday:
    'text-[var(--muted-foreground)] w-9 text-[10px] font-medium uppercase tracking-wide pb-1',
  day: 'h-10 w-9 p-0 text-center text-sm align-middle relative',
  day_button:
    'inline-flex h-10 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
  selected:
    '[&_button]:bg-[var(--primary)] [&_button]:text-[var(--primary-foreground)]',
  range_start:
    '[&_button]:bg-[var(--primary)] [&_button]:text-[var(--primary-foreground)] [&_button]:rounded-l-md [&_button]:rounded-r-none',
  range_end:
    '[&_button]:bg-[var(--primary)] [&_button]:text-[var(--primary-foreground)] [&_button]:rounded-r-md [&_button]:rounded-l-none',
  range_middle:
    '[&_button]:bg-[color-mix(in_oklch,var(--primary),transparent_60%)] [&_button]:text-[var(--foreground)] [&_button]:rounded-none',
  today: 'hytta-today',
  disabled: 'opacity-30',
  outside: 'opacity-0',
};

function CalendarHeader({
  month,
  onMonthChange,
  locale,
  prevLabel,
  nextLabel,
  todayLabel,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  locale: string;
  prevLabel: string;
  nextLabel: string;
  todayLabel: string;
}) {
  const today = startOfToday();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // "May 2026" / "mai 2026" — single string keeps the bar narrow.
  const monthYear = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month),
    [locale, month],
  );

  // Short month names for the 3×4 picker grid (e.g. "Jan", "Feb").
  const monthNames = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short' });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
  }, [locale]);

  const setYear = (y: number) => onMonthChange(new Date(y, month.getMonth(), 1));
  const setMonthIdx = (idx: number) => {
    onMonthChange(new Date(month.getFullYear(), idx, 1));
    setPickerOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
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
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm font-medium capitalize active:bg-[var(--muted)]"
        >
          {monthYear}
          <ChevronDown
            className={cn('size-3.5 transition-transform', pickerOpen && 'rotate-180')}
          />
        </button>

        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] active:bg-[var(--muted)]"
        >
          <ChevronRight className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => onMonthChange(startOfMonth(today))}
          disabled={isCurrentMonth}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-medium active:bg-[var(--muted)] disabled:opacity-40"
        >
          {todayLabel}
        </button>
      </div>

      {pickerOpen && (
        <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setYear(month.getFullYear() - 1)}
              className="inline-flex size-8 items-center justify-center rounded-md hover:bg-[var(--muted)]"
              aria-label={`${month.getFullYear() - 1}`}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[3rem] text-center text-sm font-semibold tabular-nums">
              {month.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setYear(month.getFullYear() + 1)}
              className="inline-flex size-8 items-center justify-center rounded-md hover:bg-[var(--muted)]"
              aria-label={`${month.getFullYear() + 1}`}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {monthNames.map((name, idx) => {
              const active = idx === month.getMonth();
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMonthIdx(idx)}
                  className={cn(
                    'rounded-md px-2 py-2 text-xs font-medium capitalize',
                    active
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--foreground)] hover:bg-[var(--muted)]',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
