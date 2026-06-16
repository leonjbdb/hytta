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

  // While picking the end date, render (and recolour lighter) the range the
  // hovered day would produce, reusing the committed range's own styling.
  const rangeShown =
    ctrl.previewRange ?? (selection.mode === 'range' ? selection.value : undefined);
  // A range with a start but no end yet is "in progress" — show it (the lone
  // start, or the hovered preview) in the lighter preview shade. It only turns
  // the committed green once the end is clicked too.
  const rangeIncomplete =
    selection.mode === 'range' && Boolean(selection.value?.from) && !selection.value?.to;

  const occupancyContext = React.useMemo(
    // cellWidth 48 ≙ the `w-12` day cell below; sizes the room icons.
    () => ({
      byDay: occupancy,
      rooms,
      fullyBooked: fullyBookedSet,
      cellWidth: 48,
      onDayHover: ctrl.setHoverDate,
    }),
    [occupancy, rooms, fullyBookedSet, ctrl.setHoverDate],
  );

  const dayPicker =
    selection.mode === 'range' ? (
      <DayPicker
        mode="range"
        selected={rangeShown}
        modifiers={getRangeContinuationModifiers(rangeShown, month)}
        modifiersClassNames={RANGE_CONTINUATION_CLASSNAMES}
        showOutsideDays
        onSelect={(_next, triggerDate) => ctrl.handleDayClick(triggerDate)}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={1}
        weekStartsOn={1}
        locale={dpLocale}
        disabled={disablePast ? [{ before: new Date() }] : undefined}
        components={{ DayButton: CustomDayButton }}
        className={cn('rdp-root mx-auto', rangeIncomplete && 'hytta-range-preview')}
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
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--hytta-calendar-bg)] p-4">
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
  // No transition: the range fill snaps instantly to whatever cell the cursor
  // is over (and shows nothing extra when it isn't over a valid day).
  day_button:
    'inline-flex h-12 w-12 items-center justify-center rounded-md hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
  // Selected/range days keep their green on hover, just a shade darker (the
  // default muted-bg hover would wipe the green out).
  selected:
    '[&_button]:bg-[var(--hytta-range-fill)] [&_button]:text-[var(--hytta-range-text)] [&_button]:hover:bg-[var(--hytta-range-fill)]',
  range_start:
    '[&_button]:bg-[var(--hytta-range-fill)] [&_button]:text-[var(--hytta-range-text)] [&_button]:hover:bg-[var(--hytta-range-fill)] [&_button]:rounded-l-md [&_button]:rounded-r-none [&:last-child_button]:rounded-r-md',
  range_end:
    '[&_button]:bg-[var(--hytta-range-fill)] [&_button]:text-[var(--hytta-range-text)] [&_button]:hover:bg-[var(--hytta-range-fill)] [&_button]:rounded-r-md [&_button]:rounded-l-none [&:first-child_button]:rounded-l-md',
  range_middle:
    '[&_button]:bg-[color-mix(in_oklch,var(--hytta-range-fill),transparent_60%)] [&_button]:text-[var(--foreground)] [&_button]:hover:bg-[color-mix(in_oklch,var(--hytta-range-fill),transparent_60%)] [&_button]:rounded-none [&:first-child_button]:rounded-l-md [&:last-child_button]:rounded-r-md',
  today: 'hytta-today',
  // Replace rdp's default `rdp-disabled` class (which sets opacity: 0.5 on the
  // whole cell) with an inert marker, so the cell — and its concave ear + hover
  // pill — stay full opacity. CustomDayButton dims just the date + marks instead.
  disabled: 'hytta-past',
  // Outside (adjacent-month) days are rendered (showOutsideDays) only so a
  // month-end concave ear has a cell to paint on. Hide their number/marks and
  // make them inert, so they stay visually empty + unclickable — but the cell
  // background (the concave ear) still shows.
  outside:
    '[&_button]:pointer-events-none [&_button_span]:opacity-0 [&[data-selected]_button]:!bg-transparent',
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
    <div className="mx-auto flex w-[calc(7*3rem)] flex-col gap-2">
      {/* Header spans the same width as the 7-column day grid (7 × the w-12 day
          cell = 21rem), so the controls line up with the calendar. Month + year
          selects: the month fills the row, the year is fixed. */}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
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
        <div className="w-20 shrink-0">
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

      {/* Step a month at a time, or jump back to the current month. The Today
          button flexes to fill the row, so it spans the grid width too. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={prevLabel}
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onMonthChange(startOfMonth(today))}
          disabled={isCurrentMonth}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-40"
        >
          {todayLabel}
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
