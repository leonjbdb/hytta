import { aliasedTable, and, eq, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { beds, reservations, rooms, users } from '@/db/schema';
import { buildIcs, type IcsEvent } from './ics';

export type FeedScope = 'me' | 'all';

interface FeedRow {
  rowId: string;
  bookingId: string | null;
  userId: string | null;
  participantName: string | null;
  participantEmail: string | null;
  guestName: string | null;
  bookerId: string | null;
  bookerName: string | null;
  bookerEmail: string | null;
  targetKind: 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT';
  roomNameNb: string | null;
  roomNameEn: string | null;
  bedLabel: string | null;
  bedKind: 'DOUBLE' | 'SINGLE' | null;
  startDate: string;
  endDate: string;
  createdAt: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

interface BuildOptions {
  /** Locale used to pick room names; defaults to nb-NO. */
  locale: 'nb-NO' | 'en-GB';
  scope: FeedScope;
  /** Required when `scope === 'me'`. The personal owner of the feed. */
  viewerId?: string;
  /** Cottage display name — prefixes event summaries and the calendar name. */
  cottageName: string;
}

const localeRoomName = (
  row: FeedRow,
  locale: BuildOptions['locale'],
): string | null =>
  locale === 'en-GB'
    ? row.roomNameEn ?? row.roomNameNb
    : row.roomNameNb ?? row.roomNameEn;

const targetSummary = (row: FeedRow, locale: BuildOptions['locale']): string => {
  if (row.targetKind === 'FULL_COTTAGE') {
    return locale === 'en-GB' ? 'Whole cottage' : 'Hele hytta';
  }
  if (row.targetKind === 'ROOM' || row.targetKind === 'SLOT') {
    return localeRoomName(row, locale) ?? '?';
  }
  if (row.targetKind === 'BED') {
    const kind = row.bedKind === 'DOUBLE'
      ? locale === 'en-GB' ? 'Double bed' : 'Dobbeltseng'
      : locale === 'en-GB' ? 'Single bed' : 'Enkeltseng';
    const room = localeRoomName(row, locale);
    return room ? `${kind} (${room})` : kind;
  }
  return '?';
};

const participantOf = (row: FeedRow): string =>
  row.participantName ?? row.participantEmail ?? row.guestName ?? '—';

/**
 * Fetch confirmed reservations for the requested scope and shape them into
 * one VEVENT per booking. Multi-row bookings collapse — the description
 * lists each occupant + their room/bed.
 */
export async function buildFeed(opts: BuildOptions): Promise<string> {
  const { scope, viewerId, locale, cottageName } = opts;
  if (scope === 'me' && !viewerId) {
    throw new Error('viewerId is required when scope is "me"');
  }

  const participantUser = aliasedTable(users, 'participant_user');
  const bookerUser = aliasedTable(users, 'booker_user');

  const baseQuery = db
    .select({
      rowId: reservations.id,
      bookingId: reservations.bookingId,
      userId: reservations.userId,
      participantName: participantUser.name,
      participantEmail: participantUser.email,
      guestName: reservations.guestName,
      bookerId: reservations.bookerId,
      bookerName: bookerUser.name,
      bookerEmail: bookerUser.email,
      targetKind: reservations.targetKind,
      roomNameNb: rooms.nameNb,
      roomNameEn: rooms.nameEn,
      bedLabel: beds.label,
      bedKind: beds.kind,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      createdAt: reservations.createdAt,
      status: reservations.status,
    })
    .from(reservations)
    .leftJoin(participantUser, eq(participantUser.id, reservations.userId))
    .leftJoin(bookerUser, eq(bookerUser.id, reservations.bookerId))
    .leftJoin(rooms, eq(rooms.id, reservations.roomId))
    .leftJoin(beds, eq(beds.id, reservations.bedId));

  // PENDING + CONFIRMED both show up — pending events are emitted with
  // STATUS:TENTATIVE so calendar apps render them with a hatched / lighter
  // style. CANCELLED is dropped from the feed entirely.
  const activeOnly = or(
    eq(reservations.status, 'CONFIRMED'),
    eq(reservations.status, 'PENDING'),
  )!;
  const rows = (
    scope === 'me'
      ? await baseQuery
          .where(
            and(
              activeOnly,
              or(
                eq(reservations.userId, viewerId!),
                eq(reservations.bookerId, viewerId!),
              ),
            ),
          )
          .all()
      : await baseQuery.where(activeOnly).all()
  ) as FeedRow[];

  // Group by booking — a booking with N participants becomes one VEVENT.
  interface Group {
    bookingId: string;
    startDate: string;
    endDate: string;
    bookerName: string | null;
    createdAt: number;
    rows: FeedRow[];
    /** TENTATIVE if any row in the booking is PENDING; otherwise CONFIRMED. */
    anyPending: boolean;
  }
  const byBooking = new Map<string, Group>();
  for (const r of rows) {
    const key = r.bookingId ?? r.rowId;
    const existing = byBooking.get(key);
    if (existing) {
      existing.rows.push(r);
      if (r.createdAt < existing.createdAt) existing.createdAt = r.createdAt;
      if (r.status === 'PENDING') existing.anyPending = true;
    } else {
      byBooking.set(key, {
        bookingId: key,
        startDate: r.startDate,
        endDate: r.endDate,
        bookerName: r.bookerName ?? r.bookerEmail ?? null,
        createdAt: r.createdAt,
        rows: [r],
        anyPending: r.status === 'PENDING',
      });
    }
  }

  const sorted = [...byBooking.values()].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  const events: IcsEvent[] = sorted.map((g) => {
    g.rows.sort((a, b) => a.createdAt - b.createdAt);
    const peopleCount = g.rows.length;
    const baseSummary =
      peopleCount === 1
        ? `${cottageName} — ${participantOf(g.rows[0]!)}`
        : locale === 'en-GB'
          ? `${cottageName} — ${peopleCount} people`
          : `${cottageName} — ${peopleCount} personer`;
    // Prefix the summary with [Tentative] when the booking is unapproved —
    // some calendar UIs surface STATUS, others don't, so the prefix makes
    // it visible everywhere.
    const summary = g.anyPending
      ? locale === 'en-GB'
        ? `[Tentative] ${baseSummary}`
        : `[Tentativ] ${baseSummary}`
      : baseSummary;
    const description = g.rows
      .map((r) => `${participantOf(r)}: ${targetSummary(r, locale)}`)
      .concat(
        g.bookerName
          ? [
              locale === 'en-GB'
                ? `Booked by ${g.bookerName}`
                : `Bestilt av ${g.bookerName}`,
            ]
          : [],
      )
      .join('\n');

    return {
      uid: `${g.bookingId}@hytta`,
      summary,
      description,
      startDate: g.startDate,
      endDate: g.endDate,
      createdAt: g.createdAt,
      status: g.anyPending ? 'TENTATIVE' : 'CONFIRMED',
    };
  });

  const calendarName =
    scope === 'me'
      ? locale === 'en-GB'
        ? `${cottageName} — my stays`
        : `${cottageName} — mine opphold`
      : locale === 'en-GB'
        ? `${cottageName} — all bookings`
        : `${cottageName} — alle reservasjoner`;

  return buildIcs(events, calendarName);
}

