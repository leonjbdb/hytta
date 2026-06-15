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
  RoomLegend,
  addMonths,
  startOfMonth,
  startOfToday,
  useOccupancyCalendar,
  type OccupancyCalendarProps,
} from './OccupancyCalendar.shared';

/**
 * Desktop occupancy calendar. Same data + selection contract as the mobile
 * variant — only the chrome differs (SearchableSelect month/year picker,
 * larger day cells, two-month-friendly grid).
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
        classNames={DESKTOP_CLASSNAMES}
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
        classNames={DESKTOP_CLASSNAMES}
      />
    );

  return (
    <OccupancyContext.Provider value={occupancyContext}>
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card),var(--color-moss-100)_8%)] p-4">
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
        <p className="text-[11px] text-[var(--muted-foreground)]">{t('fullyBookedNote')}</p>
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

const DESKTOP_CLASSNAMES = {
  months: 'flex gap-6',
  month_caption: 'hidden',
  nav: 'hidden',
  weekday:
    'text-[var(--muted-foreground)] w-12 text-[11px] font-medium uppercase tracking-wide pb-2',
  day: 'h-12 w-12 p-0 text-center text-sm align-middle relative',
  day_button:
    'inline-flex h-12 w-12 items-center justify-center rounded-md transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
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

  const monthOptions = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      name: fmt.format(new Date(2024, i, 1)),
    }));
  }, [locale]);

  // Suggested years: today + next 5. Past + far-future years still reachable
  // via free-text input (`allowCustom`). Past navigation is intentional so
  // users can browse who has stayed previously.
  const baseYear = today.getFullYear();
  const yearOptions = React.useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: String(baseYear + i),
        name: String(baseYear + i),
      })),
    [baseYear],
  );

  const setMonthIdx = (idx: number) => {
    onMonthChange(new Date(month.getFullYear(), idx, 1));
  };
  const setYear = (y: number) => {
    onMonthChange(new Date(y, month.getMonth(), 1));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onMonthChange(startOfMonth(today))}
          disabled={isCurrentMonth}
          className="self-end rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-40"
        >
          {todayLabel}
        </button>
        <button
          type="button"
          aria-label={prevLabel}
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="inline-flex size-8 shrink-0 items-center justify-center self-end rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-44 shrink-0">
            <SearchableSelect
              label={monthLabel}
              options={monthOptions}
              value={String(month.getMonth())}
              onChange={(id) => setMonthIdx(Number(id))}
              allowCustom={(q) => {
                const n = Number(q);
                if (!Number.isInteger(n)) return null;
                if (n < 1 || n > 12) return null;
                return String(n - 1);
              }}
            />
          </div>
          <div className="w-24 shrink-0">
            <SearchableSelect
              label={yearLabel}
              options={yearOptions}
              value={String(month.getFullYear())}
              onChange={(id) => setYear(Number(id))}
              allowCustom={(q) => {
                const n = Number(q);
                if (!Number.isInteger(n)) return null;
                if (n < 1970 || n > 2999) return null;
                return String(n);
              }}
            />
          </div>
        </div>

        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="inline-flex size-8 shrink-0 items-center justify-center self-end rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
