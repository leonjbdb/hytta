'use client';

import * as React from 'react';
import type { DateRange, DayButtonProps } from 'react-day-picker';
import { useLocale, useTranslations } from 'next-intl';
import { cn, toISODate } from '@/lib/utils';
import { fetchOccupancy, type DayAssignment } from '@/server/actions/availability';
import { roomLabel } from '@/lib/booking/room-label';
import { RoomIcon } from './RoomIcon';

/* --------------------------------------------------------------------- *
 * Reusable core for the occupancy calendar. Both `DateRangePicker` (the
 * booking flow) and the dashboard date-filter calendar build on this:
 *
 *   - shared types + helpers
 *   - shared occupancy fetch + fully-booked derivation
 *   - shared `CustomDayButton` (renders icons / fully-booked dimming)
 *   - shared `RoomLegend`
 *   - shared selection dispatch (`useOccupancyCalendar`) — discriminated by
 *     `mode: 'range' | 'single'` so the same hook drives both UIs.
 *
 * Variant-specific layout (header chrome, day-cell sizes) lives in
 * `OccupancyCalendar.desktop.tsx` / `.mobile.tsx`. The wrappers
 * `DateRangePicker.{desktop,mobile}.tsx` add the date inputs / day-count
 * UI that only makes sense in range mode.
 * --------------------------------------------------------------------- */

export interface OccupancyCalendarRoom {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
}

/**
 * Selection contract — discriminated by `mode` so each variant only sees
 * the fields it actually uses (Interface Segregation). Adding a new mode
 * (e.g. `multi`) extends this union without touching the existing arms
 * (Open/Closed).
 */
export type OccupancyCalendarSelection =
  | {
      mode: 'range';
      value: DateRange | undefined;
      onChange: (next: DateRange | undefined) => void;
    }
  | {
      mode: 'single';
      value: Date | undefined;
      onChange: (next: Date | undefined) => void;
    };

/** What happens when the user clicks a fully-booked day. */
export type FullyBookedAction = 'details' | 'select';

export interface OccupancyCalendarProps {
  selection: OccupancyCalendarSelection;
  rooms: OccupancyCalendarRoom[];
  /** Disable days strictly before today. Default `true`. */
  disablePast?: boolean;
  /**
   * `details` (default) opens the day-details dialog — used by the booking
   * flow to surface who is staying without disturbing in-flight picks.
   * `select` lets the click flow through to selection — used by the
   * dashboard filter so users can browse historical / busy days.
   */
  fullyBookedAction?: FullyBookedAction;
  /**
   * Optional controlled visible month. If provided, the calendar treats
   * `month` as the source of truth and notifies via `onMonthChange`
   * (used by `DateRangePicker` so the calendar scrolls when the user
   * types into the start-date input). Omit for internal management.
   */
  month?: Date;
  onMonthChange?: (next: Date) => void;
}

export interface DayInfo {
  roomIds: string[];
  fullCottage: boolean;
  participants: string[];
  assignments: DayAssignment[];
  /** A requested-but-unapproved reservation covers this day → yellow dot. */
  pending: boolean;
  /** Names awaiting approval that day — tooltip on the pending dot. */
  pendingParticipants: string[];
}

export interface OccupancyContextShape {
  byDay: Map<string, DayInfo>;
  rooms: OccupancyCalendarRoom[];
  fullyBooked: Set<string>;
}

export const OccupancyContext = React.createContext<OccupancyContextShape>({
  byDay: new Map(),
  rooms: [],
  fullyBooked: new Set(),
});

/* ----------------------------- date helpers ---------------------------- */

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
export function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}
export function parseISODate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameISODay(a: Date | undefined, b: Date): boolean {
  if (!a) return false;
  return toISODate(a) === toISODate(b);
}

/* ------------------------------ controller ----------------------------- */

export interface OccupancyCalendarController {
  month: Date;
  setMonth: (d: Date) => void;
  occupancy: Map<string, DayInfo>;
  fullyBookedSet: Set<string>;
  detailsDate: Date | null;
  setDetailsDate: (d: Date | null) => void;
  detailsAssignments: DayAssignment[];
  /**
   * Single entry point used by the variant-specific DayPicker `onSelect`.
   * Dispatches based on `selection.mode` and `fullyBookedAction`.
   */
  handleDayClick: (date: Date | undefined) => void;
}

/**
 * Owns the calendar's view-state (month, occupancy fetch, fully-booked
 * derivation, day-details dialog) and the selection-dispatch logic.
 *
 * The controller doesn't render anything — variant components consume it
 * and lay out the DayPicker / header / legend in their own way.
 */
export function useOccupancyCalendar({
  selection,
  rooms,
  fullyBookedAction = 'details',
  month: monthProp,
  onMonthChange,
}: OccupancyCalendarProps): OccupancyCalendarController {
  const [internalMonth, setInternalMonth] = React.useState<Date>(() => startOfMonth(new Date()));
  const month = monthProp ?? internalMonth;
  const setMonth = React.useCallback(
    (d: Date) => {
      if (monthProp === undefined) setInternalMonth(d);
      onMonthChange?.(d);
    },
    [monthProp, onMonthChange],
  );
  const [occupancy, setOccupancy] = React.useState<Map<string, DayInfo>>(new Map());
  const [detailsDate, setDetailsDate] = React.useState<Date | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const from = toISODate(addMonths(month, -1));
    const to = toISODate(addMonths(month, 3));
    fetchOccupancy(from, to).then((entries) => {
      if (cancelled) return;
      setOccupancy(
        new Map(
          entries.map((e) => [
            e.date,
            {
              roomIds: e.roomIds,
              fullCottage: e.fullCottage,
              participants: e.participants,
              assignments: e.assignments,
              pending: e.pending,
              pendingParticipants: e.pendingParticipants,
            },
          ]),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const fullyBookedSet = React.useMemo(() => {
    const out = new Set<string>();
    const total = rooms.length;
    for (const [iso, info] of occupancy) {
      if (info.fullCottage || (total > 0 && info.roomIds.length >= total)) out.add(iso);
    }
    return out;
  }, [occupancy, rooms.length]);

  const detailsAssignments = React.useMemo(() => {
    if (!detailsDate) return [];
    return occupancy.get(toISODate(detailsDate))?.assignments ?? [];
  }, [detailsDate, occupancy]);

  const handleDayClick = React.useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      if (fullyBookedSet.has(toISODate(date)) && fullyBookedAction === 'details') {
        setDetailsDate(date);
        return;
      }

      if (selection.mode === 'range') {
        // Deterministic range cycle:
        //   click 1 → start (clears end)
        //   click 2 → end   (same day = 1-day stay; earlier than start restarts)
        //   click 3 → new start, click 4 → new end, …
        const f = selection.value?.from;
        const tt = selection.value?.to;
        if (!f || (f && tt)) {
          selection.onChange({ from: date, to: undefined });
          return;
        }
        if (date < f) {
          selection.onChange({ from: date, to: undefined });
          return;
        }
        selection.onChange({ from: f, to: date });
        return;
      }

      // Single mode toggles: clicking the active day clears the filter.
      if (sameISODay(selection.value, date)) {
        selection.onChange(undefined);
        return;
      }
      selection.onChange(date);
    },
    [selection, fullyBookedSet, fullyBookedAction],
  );

  return {
    month,
    setMonth,
    occupancy,
    fullyBookedSet,
    detailsDate,
    setDetailsDate,
    detailsAssignments,
    handleDayClick,
  };
}

/* ----------------------------- day button ----------------------------- */

export function CustomDayButton(props: DayButtonProps) {
  const { day, modifiers, children, className, ...buttonProps } = props;
  const { byDay, rooms, fullyBooked } = React.useContext(OccupancyContext);
  const t = useTranslations('Book');
  const iso = toISODate(day.date);
  const info = byDay.get(iso);
  const isToday = Boolean(modifiers?.today);
  const isFullyBooked = fullyBooked.has(iso);
  const occupiedRooms = info ? rooms.filter((r) => info.roomIds.includes(r.id)) : [];
  const tooltip = info?.participants.length ? info.participants.join(', ') : undefined;
  const isPending = Boolean(info?.pending);
  const pendingLabel = info?.pendingParticipants.length
    ? `${t('pendingApproval')}: ${info.pendingParticipants.join(', ')}`
    : t('pendingApproval');

  return (
    <button
      {...buttonProps}
      title={tooltip}
      className={cn(
        className,
        'relative flex flex-col items-center justify-center gap-0.5',
        isFullyBooked && 'opacity-60',
      )}
    >
      <span className={cn('leading-none', isToday && 'font-semibold')}>{children}</span>
      {/* Cottage-wide reservation hides per-room icons — tooltip lists names instead. */}
      {!info?.fullCottage && occupiedRooms.length > 0 && (
        <span className="flex items-center gap-0.5">
          {occupiedRooms.map((r) => (
            <RoomIcon key={r.id} name={r.icon} size={11} color={r.color} />
          ))}
        </span>
      )}
      {/* Requested-but-unapproved day: yellow dot, top-right, distinct from the booked treatment. */}
      {isPending && (
        <span
          title={pendingLabel}
          aria-label={pendingLabel}
          role="img"
          className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-amber-400 ring-1 ring-[var(--card)]"
        />
      )}
      {isToday && (
        <span
          aria-hidden
          className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
        />
      )}
    </button>
  );
}

/* ------------------------------ room legend ---------------------------- */

export function RoomLegend({
  rooms,
  legendTitle,
}: {
  rooms: OccupancyCalendarRoom[];
  legendTitle: string;
}) {
  const locale = useLocale();
  if (rooms.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--card)]/60 px-3 py-2 text-xs text-[var(--muted-foreground)]">
      <span className="font-medium uppercase tracking-wide">{legendTitle}</span>
      {rooms.map((r) => (
        <span key={r.id} className="inline-flex items-center gap-1.5">
          <RoomIcon name={r.icon} size={14} color={r.color} />
          <span>{roomLabel(r, locale)}</span>
        </span>
      ))}
    </div>
  );
}
