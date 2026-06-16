'use client';

import * as React from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarPlus, Check, ChevronDown, ChevronRight, CircleCheck, Pencil, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PersonBadge } from '@/components/PersonBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CancelRowButton, CancelBookingButton } from './cancel-buttons';
import { FullCottageShape, RoomIcon } from '@/components/booking/RoomIcon';
import { OccupancyCalendar } from '@/components/booking/OccupancyCalendar.desktop';
import { bedDisplayName } from '@/lib/booking/bed-display';
import { roomLabel } from '@/lib/booking/room-label';
import { toISODate } from '@/lib/utils';
import {
  DASHBOARD_FILTERS,
  filterByDate,
  filterGroups,
  groupBookings,
  type BookingGroup,
  type DashboardFilter,
  type DashboardProps,
  type DashboardRow,
} from '../shared';

export function Dashboard({
  upcoming,
  current,
  past,
  viewerId,
  isManager,
  isAdmin,
  rooms,
}: DashboardProps) {
  const t = useTranslations('Dashboard');
  const tBrand = useTranslations('Brand');
  const locale = useLocale();
  const [filter, setFilter] = React.useState<DashboardFilter>('mine');
  const [myStaysOnly, setMyStaysOnly] = React.useState(false);
  const [pastOpen, setPastOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(undefined);
  // The filter to restore when the date filter is cleared — captured the
  // moment a date is first picked. `null` once there's nothing to restore
  // (no date active, or the user has since changed the filter by hand).
  const [filterBeforeDate, setFilterBeforeDate] = React.useState<DashboardFilter | null>(null);

  const clearDate = React.useCallback(() => {
    setSelectedDate(undefined);
    if (filterBeforeDate !== null) setFilter(filterBeforeDate);
    setFilterBeforeDate(null);
  }, [filterBeforeDate]);

  // Picking a day reveals every booking on it — switch to "All" so other
  // people's stays aren't hidden by the "My Bookings"/"Others" filter, but
  // remember the prior filter so clearing the date restores it.
  const handleDateSelect = React.useCallback(
    (next: Date | undefined) => {
      if (!next) {
        clearDate();
        return;
      }
      // Capture the filter only when entering date-filter mode (no date yet).
      if (!selectedDate) setFilterBeforeDate(filter);
      setSelectedDate(next);
      setFilter('all');
    },
    [clearDate, filter, selectedDate],
  );

  // A manual filter change while a date is active is the user taking over —
  // drop the remembered filter so clearing the date won't undo their choice.
  const handleFilterChange = React.useCallback(
    (next: DashboardFilter) => {
      setFilter(next);
      if (selectedDate) setFilterBeforeDate(null);
    },
    [selectedDate],
  );

  const dateIso = selectedDate ? toISODate(selectedDate) : null;

  const upcomingGroups = React.useMemo(() => {
    const filtered = dateIso ? filterByDate(upcoming, dateIso) : upcoming;
    return filterGroups(groupBookings(filtered), viewerId, filter, myStaysOnly);
  }, [upcoming, viewerId, filter, myStaysOnly, dateIso]);
  const currentGroups = React.useMemo(() => {
    const filtered = dateIso ? filterByDate(current, dateIso) : current;
    return filterGroups(groupBookings(filtered), viewerId, filter, myStaysOnly);
  }, [current, viewerId, filter, myStaysOnly, dateIso]);
  const pastGroups = React.useMemo(() => {
    const filtered = dateIso ? filterByDate(past, dateIso) : past;
    return filterGroups(groupBookings(filtered), viewerId, filter, myStaysOnly);
  }, [past, viewerId, filter, myStaysOnly, dateIso]);

  // When a date is picked we want past results visible by default — they're
  // the most likely match for a backwards browse — without forcing the user
  // to expand the section manually.
  const effectivePastOpen = dateIso ? true : pastOpen;

  const renderGroup = (g: BookingGroup, options: { allowCancel: boolean }) => (
    <BookingGroupCard
      key={g.bookingId}
      g={g}
      viewerId={viewerId}
      isManager={isManager}
      isAdmin={isAdmin}
      allowCancel={options.allowCancel}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t('subtitle', { cottage: tBrand('name') })}
          </p>
        </div>
        <Link href="/book" className={buttonVariants()}>
          <CalendarPlus className="size-4" /> {t('newBooking')}
        </Link>
      </header>

      <OccupancyCalendar
        selection={{ mode: 'single', value: selectedDate, onChange: handleDateSelect }}
        rooms={rooms}
        disablePast={false}
        fullyBookedAction="select"
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterSegmented value={filter} onChange={handleFilterChange} />
          {selectedDate && (
            <DateFilterChip
              date={selectedDate}
              locale={locale}
              label={t('dateFilterLabel')}
              clearLabel={t('dateFilterClear')}
              onClear={clearDate}
            />
          )}
        </div>
        {filter === 'mine' && (
          <button
            type="button"
            aria-pressed={myStaysOnly}
            onClick={() => setMyStaysOnly((v) => !v)}
            className={
              'inline-flex w-fit cursor-pointer items-center gap-2 self-start rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ' +
              (myStaysOnly
                ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]')
            }
          >
            <span
              className={
                'flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-current ' +
                (myStaysOnly ? '' : 'opacity-70')
              }
            >
              {myStaysOnly && <Check className="size-2.5" />}
            </span>
            {t('filterMyStays')}
          </button>
        )}
      </div>

      {dateIso && currentGroups.length === 0 && upcomingGroups.length === 0 && pastGroups.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            {t('dateFilterEmpty')}
          </CardContent>
        </Card>
      )}

      {currentGroups.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
            {t('current')}
          </h2>
          <div className="flex flex-col gap-3">
            {currentGroups.map((g) => renderGroup(g, { allowCancel: true }))}
          </div>
        </section>
      )}

      {(!dateIso || upcomingGroups.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
            {t('upcoming')}
          </h2>
          {upcomingGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                {t('empty')}
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingGroups.map((g) => renderGroup(g, { allowCancel: true }))}
            </div>
          )}
        </section>
      )}

      {pastGroups.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setPastOpen((v) => !v)}
            aria-expanded={effectivePastOpen}
            className="flex w-fit items-center gap-1 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            {effectivePastOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {t('past')} ({pastGroups.length})
          </button>
          {effectivePastOpen && (
            <div className="flex flex-col gap-3 opacity-75">
              {pastGroups.map((g) => renderGroup(g, { allowCancel: false }))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * One booking rendered as an accordion. The header (dates, booker, status,
 * actions) stays visible; the participant list collapses. Your own bookings and
 * any pending request (yours or anyone's) start expanded; other people's
 * already-approved stays start collapsed to keep the dashboard scannable.
 */
function BookingGroupCard({
  g,
  viewerId,
  isManager,
  isAdmin,
  allowCancel,
}: {
  g: BookingGroup;
  viewerId: string;
  isManager: boolean;
  isAdmin: boolean;
  allowCancel: boolean;
}) {
  const t = useTranslations('Dashboard');
  const tBook = useTranslations('Book');
  const locale = useLocale();

  const isViewerBooker = g.bookerId === viewerId;
  const isParticipant = g.rows.some((r) => r.participantId === viewerId);
  const isMine = isViewerBooker || isParticipant;
  const [open, setOpen] = React.useState(g.pending || isMine);

  // Modify: owner or admin. Delete: owner, admin, or manager.
  const canModify = isViewerBooker || isAdmin;
  const canDelete = isViewerBooker || isAdmin || isManager;
  const bookerLabel = isViewerBooker ? t('you') : g.bookerName ?? '—';

  const formatDate = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const targetLabel = (r: DashboardRow): string => {
    if (r.targetKind === 'FULL_COTTAGE') return t('fullCottage');
    if ((r.targetKind === 'ROOM' || r.targetKind === 'SLOT') && (r.roomNameNb || r.roomNameEn)) {
      return roomLabel({ nameNb: r.roomNameNb, nameEn: r.roomNameEn }, locale);
    }
    if (r.targetKind === 'BED' && r.bedKind && r.bedLabel) {
      const bed = bedDisplayName(r.bedKind, r.bedLabel, (k) => tBook(k));
      const room =
        r.roomNameNb || r.roomNameEn
          ? roomLabel({ nameNb: r.roomNameNb, nameEn: r.roomNameEn }, locale)
          : null;
      return room ? `${room} / ${bed}` : bed;
    }
    return '?';
  };

  const targetIcon = (r: DashboardRow) => {
    if (r.targetKind === 'FULL_COTTAGE') return <FullCottageShape size={20} />;
    if (r.roomIcon) {
      return <RoomIcon name={r.roomIcon} size={14} color={r.roomColor ?? undefined} />;
    }
    return null;
  };

  return (
    <Card
      className={`p-4 ${g.pending ? 'border-dashed bg-[color-mix(in_oklch,var(--card),var(--color-partial)_8%)]' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-[var(--muted-foreground)]" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-[var(--muted-foreground)]" />
          )}
          <span className="flex flex-col">
            <span className="text-sm font-medium">
              {formatDate(g.startDate)} → {formatDate(g.endDate)}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {t('bookedBy', { name: bookerLabel })} ·{' '}
              {tBook('slotsUsedUnlimited', { count: g.rows.length })}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          {g.pending && (
            <Badge className="bg-[color-mix(in_oklch,var(--color-partial),white_60%)] text-[var(--color-clay-800)]">
              {t('badgePending')}
            </Badge>
          )}
          {g.pending && isManager && (
            <Link
              href="/requests"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/20"
            >
              <CircleCheck className="size-3.5" />
              {t('approve')}
            </Link>
          )}
          {allowCancel && canModify && (
            <Link
              href={`/book?edit=${g.bookingId}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              <Pencil className="size-3.5" />
              {t('edit')}
            </Link>
          )}
          {/* Whole-booking cancel: for multi-person bookings, and for any
              booking an admin/manager is acting on (i.e. not their own), so
              elevated users can always remove the entire stay — even a
              one-person one — not just a single row. */}
          {allowCancel && canDelete && (g.rows.length > 1 || !isViewerBooker) && (
            <CancelBookingButton bookingId={g.bookingId} />
          )}
        </div>
      </div>
      {open && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
          {g.rows.map((r) => {
            const canCancel =
              allowCancel &&
              (r.participantId === viewerId ||
                r.bookerId === viewerId ||
                isManager ||
                isAdmin);
            const isYou = r.participantId === viewerId;
            return (
              <li
                key={r.rowId}
                className="flex items-center gap-3 rounded-lg bg-[var(--muted)]/30 p-2"
              >
                <span
                  aria-hidden
                  className="inline-flex size-6 shrink-0 items-center justify-center"
                >
                  {targetIcon(r)}
                </span>
                <span className="text-sm font-medium">{targetLabel(r)}</span>
                <span className="text-sm text-[var(--muted-foreground)]">·</span>
                <PersonBadge
                  name={r.participantName ?? r.participantEmail ?? r.guestName ?? '—'}
                  isGuest={!r.participantId}
                  highlight={isYou}
                  isAdmin={!!r.participantIsAdmin}
                  isManager={!!r.participantIsManager}
                />
                {canCancel && (
                  <span className="ml-auto">
                    <CancelRowButton id={r.rowId} own={isYou} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function DateFilterChip({
  date,
  locale,
  label,
  clearLabel,
  onClear,
}: {
  date: Date;
  locale: string;
  label: string;
  clearLabel: string;
  onClear: () => void;
}) {
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-medium capitalize">{formatted}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        className="inline-flex size-5 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function FilterSegmented({
  value,
  onChange,
}: {
  value: DashboardFilter;
  onChange: (next: DashboardFilter) => void;
}) {
  const t = useTranslations('Dashboard');
  const labels: Record<DashboardFilter, string> = {
    mine: t('filterMine'),
    booked: t('filterBooked'),
    all: t('filterAll'),
  };
  return (
    <div
      role="radiogroup"
      aria-label={t('filterLabel')}
      className="inline-flex w-fit overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]"
    >
      {DASHBOARD_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={value === f}
          onClick={() => onChange(f)}
          className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
            value === f
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          {labels[f]}
        </button>
      ))}
    </div>
  );
}
