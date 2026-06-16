'use client';

import * as React from 'react';
import type { DateRange, DayButtonProps } from 'react-day-picker';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn, toISODate } from '@/lib/utils';
import { fetchOccupancy, type DayAssignment } from '@/server/actions/availability';
import { BOOKINGS_CHANGED_EVENT } from '@/lib/booking/refresh-events';
import { roomLabel } from '@/lib/booking/room-label';
import { FullCottageShape, RoomIcon } from './RoomIcon';

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
  /** Capacity-aware: true only when no bookable space remains (server-computed). */
  fullyBooked: boolean;
}

export interface OccupancyContextShape {
  byDay: Map<string, DayInfo>;
  rooms: OccupancyCalendarRoom[];
  fullyBooked: Set<string>;
  /** Day-cell width in px — drives how big the room icons can be drawn. */
  cellWidth: number;
}

export const OccupancyContext = React.createContext<OccupancyContextShape>({
  byDay: new Map(),
  rooms: [],
  fullyBooked: new Set(),
  cellWidth: 48,
});

/**
 * Most room icons we draw inside a day cell before collapsing to a single
 * whole-cottage glyph. From 4 rooms up, the cell shows the cottage icon
 * instead (the tooltip still lists every room).
 */
const MAX_DAY_ICONS = 3;
const ICONS_PER_ROW = 5;

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

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const WEEK_START_DAY = 1; // Monday, matching DayPicker weekStartsOn={1}.
const WEEK_END_DAY = 0; // Sunday.

export const RANGE_CONTINUATION_CLASSNAMES = {
  rangeContinuesAfterWeek: 'hytta-range-continues-after-week',
  rangeContinuesBeforeWeek: 'hytta-range-continues-before-week',
  // Month-boundary continuation reuses the row-wrap fade (same right/left edge fade).
  rangeContinuesAfterMonth: 'hytta-range-continues-after-week',
  rangeContinuesBeforeMonth: 'hytta-range-continues-before-week',
  rangeStartContinuesBelow: 'hytta-range-start-continues-below [&_button]:!rounded-bl-none',
  rangeEndContinuesAbove: 'hytta-range-end-continues-above [&_button]:!rounded-tr-none',
  // Concave cells square every corner except the one carrying the green "ear".
  // These cells sit inside the selection's elbow, so with border-collapse any
  // rounded corner exposes a neighbouring green cell behind the inset — we keep
  // them flush at rest and on hover (hover just darkens the same shape). The ear
  // stays rounded: before-start → BR, after-end → TL.
  rangeConcaveBeforeStart:
    'hytta-range-concave-before-start [&_button]:!rounded-tl-none [&_button]:!rounded-tr-none [&_button]:!rounded-bl-none',
  rangeConcaveAfterEnd:
    'hytta-range-concave-after-end [&_button]:!rounded-tr-none [&_button]:!rounded-bl-none [&_button]:!rounded-br-none',
};

export function getRangeContinuationModifiers(range: DateRange | undefined, displayedMonth?: Date) {
  const fromDate = range?.from;
  const toDate = range?.to;
  const from = fromDate ? toISODate(fromDate) : null;
  const to = toDate ? toISODate(toDate) : null;
  // A concave ear can land on an adjacent-month cell (range ending on the month's
  // last day). Only draw it when the real start/end sits in the month on screen —
  // if the range merely crosses into another month, the end cell and its ear
  // belong off-screen, so we skip both.
  const inDisplayedMonth = (d: Date) =>
    !displayedMonth ||
    (d.getFullYear() === displayedMonth.getFullYear() &&
      d.getMonth() === displayedMonth.getMonth());

  return {
    rangeContinuesAfterWeek: (date: Date) => {
      if (!from || !to) return false;
      const iso = toISODate(date);
      return date.getDay() === WEEK_END_DAY && iso >= from && iso < to;
    },
    rangeContinuesBeforeWeek: (date: Date) => {
      if (!from || !to) return false;
      const iso = toISODate(date);
      return date.getDay() === WEEK_START_DAY && iso > from && iso <= to;
    },
    // Last in-month day of a range that continues into the next month (its end
    // sits off-screen). Fades the green out at the right edge, same as a week wrap.
    rangeContinuesAfterMonth: (date: Date) => {
      if (!from || !to) return false;
      const iso = toISODate(date);
      if (iso < from || iso >= to) return false;
      return inDisplayedMonth(date) && !inDisplayedMonth(addDays(date, 1));
    },
    // First in-month day of a range that continues from the previous month — fades
    // the green out at the left edge.
    rangeContinuesBeforeMonth: (date: Date) => {
      if (!from || !to) return false;
      const iso = toISODate(date);
      if (iso <= from || iso > to) return false;
      return inDisplayedMonth(date) && !inDisplayedMonth(addDays(date, -1));
    },
    // The cell each ear leans on is one week above/below it (addDays ±7). It must
    // be both in the range AND on screen — otherwise the ear smooths against a
    // selection in an adjacent month that isn't visible (e.g. a top-row ear that
    // references the previous month), which reads as a stray corner.
    rangeStartContinuesBelow: (date: Date) => {
      if (!from || !to || !sameISODay(range?.from, date)) return false;
      // A start on Monday already sits on the week's left edge — keep its rounded
      // corner instead of squaring it to attach to the row below.
      if (date.getDay() === WEEK_START_DAY) return false;
      if (!inDisplayedMonth(date)) return false;
      const below = addDays(date, 7);
      return toISODate(below) <= to && inDisplayedMonth(below);
    },
    rangeEndContinuesAbove: (date: Date) => {
      if (!from || !to || !sameISODay(range?.to, date)) return false;
      // An end on Sunday already sits on the week's right edge — keep its rounded
      // corner instead of squaring it to attach to the row above.
      if (date.getDay() === WEEK_END_DAY) return false;
      if (!inDisplayedMonth(date)) return false;
      const above = addDays(date, -7);
      return toISODate(above) >= from && inDisplayedMonth(above);
    },
    rangeConcaveBeforeStart: (date: Date) => {
      if (!fromDate || !to || fromDate.getDay() === WEEK_START_DAY) return false;
      if (!inDisplayedMonth(fromDate)) return false;
      if (toISODate(date) !== toISODate(addDays(fromDate, -1))) return false;
      const below = addDays(date, 7);
      return toISODate(below) <= to && inDisplayedMonth(below);
    },
    rangeConcaveAfterEnd: (date: Date) => {
      if (!toDate || !from || toDate.getDay() === WEEK_END_DAY) return false;
      if (!inDisplayedMonth(toDate)) return false;
      if (toISODate(date) !== toISODate(addDays(toDate, 1))) return false;
      const above = addDays(date, -7);
      return toISODate(above) >= from && inDisplayedMonth(above);
    },
  };
}

/**
 * Count days in the inclusive range [from, to] that are fully booked (whole
 * cottage taken, or every slot filled). A stay occupies every day in the
 * range — `daysInRange` is inclusive — so any fully-booked day in between
 * makes the whole range unbookable.
 */
function fullyBookedDaysInRange(from: Date, to: Date, fullyBooked: Set<string>): number {
  let count = 0;
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    if (fullyBooked.has(toISODate(cur))) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
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
  const t = useTranslations('Book');
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

  const loadOccupancy = React.useCallback(() => {
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
              fullyBooked: e.fullyBooked,
            },
          ]),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  // Refetch when the visible window changes.
  React.useEffect(() => loadOccupancy(), [loadOccupancy]);

  // Also refetch when a booking changes elsewhere (e.g. a stay cancelled on the
  // dashboard). The occupancy is client-fetched, so a server-side revalidate
  // can't reach it — this keeps the calendar in sync with the list.
  React.useEffect(() => {
    const onChanged = () => loadOccupancy();
    window.addEventListener(BOOKINGS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BOOKINGS_CHANGED_EVENT, onChanged);
  }, [loadOccupancy]);

  // A day is unselectable only when the server says no bookable space remains
  // (capacity-aware). A room with free beds/slots — or any unlimited room —
  // keeps the day bookable, so you can still request the available spaces.
  const fullyBookedSet = React.useMemo(() => {
    const out = new Set<string>();
    for (const [iso, info] of occupancy) {
      if (info.fullyBooked) out.add(iso);
    }
    return out;
  }, [occupancy]);

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
        // Reject a range that spans any fully-booked day — the whole cottage is
        // taken on those dates, so a stay covering them can't be booked.
        const blocked = fullyBookedDaysInRange(f, date, fullyBookedSet);
        if (blocked > 0) {
          toast.warning(t('rangeBlockedTitle'), {
            description: t('rangeBlockedBody', { count: blocked }),
          });
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
    [selection, fullyBookedSet, fullyBookedAction, t],
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

/** One row of the day tooltip — a room (or the whole cottage) and who's in it. */
interface DayTooltipGroup {
  key: string;
  label: string;
  /** Room icon name, or `null` for the whole-cottage row. */
  icon: string | null;
  color: string | null;
  names: string[];
}

/**
 * Group a day's assignments by room (plus a whole-cottage row), ordered to
 * match the on-screen icons, so the hover tooltip can list every room booked
 * that day and who is staying in each — even when the icons collapse to a
 * single cottage glyph.
 */
function buildDayTooltipGroups(
  info: DayInfo,
  rooms: OccupancyCalendarRoom[],
  locale: string,
  fullCottageLabel: string,
): DayTooltipGroup[] {
  const groups: DayTooltipGroup[] = [];

  const cottageNames = info.assignments.filter((a) => a.fullCottage).map((a) => a.name);
  if (cottageNames.length > 0) {
    groups.push({ key: 'cottage', label: fullCottageLabel, icon: null, color: null, names: cottageNames });
  }

  const byRoom = new Map<string, string[]>();
  for (const a of info.assignments) {
    if (a.fullCottage || !a.roomId) continue;
    const list = byRoom.get(a.roomId) ?? [];
    list.push(a.name);
    byRoom.set(a.roomId, list);
  }
  for (const r of rooms) {
    const names = byRoom.get(r.id);
    if (names?.length) {
      groups.push({ key: r.id, label: roomLabel(r, locale), icon: r.icon, color: r.color, names });
    }
  }

  return groups;
}

export function CustomDayButton(props: DayButtonProps) {
  const { day, modifiers, className, ...buttonProps } = props;
  const { byDay, rooms, fullyBooked, cellWidth } = React.useContext(OccupancyContext);
  const t = useTranslations('Book');
  const locale = useLocale();
  const iso = toISODate(day.date);
  const info = byDay.get(iso);
  const isToday = Boolean(modifiers?.today);
  // Past/disabled days dim their number + marks only — NOT the cell — so the
  // concave green "ear" (a cell background) and the hover pill keep full opacity.
  const isDisabled = Boolean(modifiers?.disabled);
  const isFullyBooked = fullyBooked.has(iso);
  const occupiedRooms = info ? rooms.filter((r) => info.roomIds.includes(r.id)) : [];
  const tooltipGroups = info
    ? buildDayTooltipGroups(info, rooms, locale, t('fullCottage'))
    : [];
  // Fold the occupancy into the day's existing screen-reader label (the date),
  // so the same information the visual tooltip shows is announced too.
  const baseLabel = (buttonProps as { 'aria-label'?: string })['aria-label'];
  const ariaLabel =
    tooltipGroups.length > 0
      ? [baseLabel, tooltipGroups.map((g) => `${g.label}: ${g.names.join(', ')}`).join('; ')]
          .filter(Boolean)
          .join(' — ')
      : baseLabel;
  const isPending = Boolean(info?.pending);
  const pendingLabel = info?.pendingParticipants.length
    ? `${t('pendingApproval')}: ${info.pendingParticipants.join(', ')}`
    : t('pendingApproval');

  // A whole-cottage booking — or simply more rooms than fit two rows — collapses
  // to the single whole-cottage glyph; the tooltip still lists every room.
  const showCottageGlyph = Boolean(info?.fullCottage) || occupiedRooms.length > MAX_DAY_ICONS;
  const hasMarks = Boolean(info?.fullCottage) || occupiedRooms.length > 0;

  // Size icons to the cell: shrink as columns grow so a full row never overflows.
  const cols = Math.min(occupiedRooms.length || 1, ICONS_PER_ROW);
  const iconSize = Math.max(6, Math.min(13, Math.floor((cellWidth - 6 - (cols - 1)) / cols)));
  const cottageSize = Math.round(cellWidth / 3);

  return (
    <button
      {...buttonProps}
      aria-label={ariaLabel}
      className={cn(
        className,
        'group relative flex flex-col items-center justify-center gap-0.5',
        'cursor-pointer disabled:cursor-default',
        // Lift the hovered cell so its tooltip overlays neighbouring days.
        tooltipGroups.length > 0 && 'hover:z-20',
      )}
    >
      {/* Dim only the date + marks for fully-booked days — NOT the button, or
          the absolutely-positioned tooltip below would inherit the opacity. */}
      <span
        className={cn(
          'relative z-10 leading-none',
          isToday && 'font-semibold',
          isFullyBooked && 'opacity-60',
          isDisabled && 'opacity-30',
        )}
      >
        {day.date.getDate()}
      </span>
      {/* Custom hover tooltip — styled like the booking summary card — listing
          every room booked that day and who is staying in each. */}
      {tooltipGroups.length > 0 && (
        <span
          role="tooltip"
          aria-hidden
          className="pointer-events-none absolute top-full left-1/2 z-30 mt-2 flex w-max max-w-[15rem] -translate-x-1/2 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
        >
          {tooltipGroups.map((g) => (
            <span key={g.key} className="flex items-start gap-2">
              <span className="mt-px shrink-0">
                {g.icon ? (
                  <RoomIcon name={g.icon} size={14} color={g.color ?? undefined} />
                ) : (
                  <FullCottageShape size={14} />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-semibold leading-tight text-[var(--foreground)]">
                  {g.label}
                </span>
                {g.names.map((n, i) => (
                  <span
                    key={`${g.key}-${i}`}
                    className="text-xs leading-tight text-[var(--muted-foreground)]"
                  >
                    {n}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </span>
      )}
      {hasMarks && (
        <span className={cn('relative z-10', isFullyBooked && 'opacity-60', isDisabled && 'opacity-30')}>
          {showCottageGlyph ? (
            <FullCottageShape size={cottageSize} />
          ) : (
            <span
              className="grid place-items-center gap-px"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {occupiedRooms.map((r) => (
                <RoomIcon key={r.id} name={r.icon} size={iconSize} color={r.color} />
              ))}
            </span>
          )}
        </span>
      )}
      {/* Requested-but-unapproved day: yellow dot, top-right, distinct from the booked treatment. */}
      {isPending && (
        <span
          title={pendingLabel}
          aria-label={pendingLabel}
          role="img"
          className="absolute right-0.5 top-0.5 z-10 size-1.5 rounded-full bg-amber-400 ring-1 ring-[var(--card)]"
        />
      )}
      {isToday && (
        <span
          aria-hidden
          className="absolute bottom-1 left-1/2 z-10 size-1 -translate-x-1/2 rounded-full bg-current"
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
