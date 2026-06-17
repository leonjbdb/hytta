import { describe, expect, it } from 'bun:test';
import {
  describeSegment,
  segmentByOccupancy,
  summariseSegment,
  type FeedRow,
} from '@/lib/calendar/feed';
import { buildIcs, type IcsEvent } from '@/lib/calendar/ics';

let counter = 0;
function row(
  p: Partial<FeedRow> & Pick<FeedRow, 'startDate' | 'endDate'>,
): FeedRow {
  return {
    rowId: p.rowId ?? `row-${++counter}`,
    userId: p.userId ?? null,
    participantName: p.participantName ?? null,
    participantEmail: p.participantEmail ?? null,
    guestName: p.guestName ?? null,
    targetKind: p.targetKind ?? 'ROOM',
    roomId: p.roomId ?? null,
    roomNameNb: p.roomNameNb ?? null,
    roomNameEn: p.roomNameEn ?? null,
    startDate: p.startDate,
    endDate: p.endDate,
    createdAt: p.createdAt ?? 1000,
    status: p.status ?? 'CONFIRMED',
  };
}

const alice = (startDate: string, endDate: string, extra: Partial<FeedRow> = {}) =>
  row({
    userId: 'alice',
    participantName: 'Alice',
    roomId: 'roomA',
    roomNameEn: 'Blue',
    roomNameNb: 'Blå',
    startDate,
    endDate,
    ...extra,
  });

const bob = (startDate: string, endDate: string, extra: Partial<FeedRow> = {}) =>
  row({
    userId: 'bob',
    participantName: 'Bob',
    roomId: 'roomB',
    roomNameEn: 'Yellow',
    roomNameNb: 'Gul',
    startDate,
    endDate,
    ...extra,
  });

describe('segmentByOccupancy', () => {
  it('keeps one person staying several days as a single event', () => {
    const segs = segmentByOccupancy([alice('2026-06-25', '2026-06-27')], 'en-GB');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startDate).toBe('2026-06-25');
    expect(segs[0]!.endDate).toBe('2026-06-27');
    expect(segs[0]!.members).toHaveLength(1);
  });

  it('splits the day a second person joins', () => {
    const segs = segmentByOccupancy(
      [alice('2026-06-25', '2026-06-27'), bob('2026-06-26', '2026-06-27')],
      'en-GB',
    );
    expect(segs).toHaveLength(2);
    // Day 1: Alice alone.
    expect(segs[0]!.startDate).toBe('2026-06-25');
    expect(segs[0]!.endDate).toBe('2026-06-25');
    expect(new Set(segs[0]!.members.map((m) => m.personKey))).toEqual(new Set(['alice']));
    // Days 2–3: Alice + Bob.
    expect(segs[1]!.startDate).toBe('2026-06-26');
    expect(segs[1]!.endDate).toBe('2026-06-27');
    expect(new Set(segs[1]!.members.map((m) => m.personKey))).toEqual(
      new Set(['alice', 'bob']),
    );
  });

  it('merges back-to-back reservations for the same person + room', () => {
    const segs = segmentByOccupancy(
      [alice('2026-06-25', '2026-06-26'), alice('2026-06-27', '2026-06-28')],
      'en-GB',
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startDate).toBe('2026-06-25');
    expect(segs[0]!.endDate).toBe('2026-06-28');
  });

  it('does not merge across an empty gap day', () => {
    const segs = segmentByOccupancy(
      [alice('2026-06-25', '2026-06-26'), alice('2026-06-28', '2026-06-29')],
      'en-GB',
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]!.endDate).toBe('2026-06-26');
    expect(segs[1]!.startDate).toBe('2026-06-28');
  });

  it('returns no events when nobody is staying', () => {
    expect(segmentByOccupancy([], 'en-GB')).toEqual([]);
  });

  it('marks a segment tentative when any contributing row is pending', () => {
    const segs = segmentByOccupancy(
      [alice('2026-06-25', '2026-06-26', { status: 'PENDING' })],
      'en-GB',
    );
    expect(segs[0]!.anyPending).toBe(true);
  });

  it('splits when a pending row and a confirmed row would otherwise share days', () => {
    // Same person + room, adjacent days, different status → distinct state.
    const segs = segmentByOccupancy(
      [
        alice('2026-06-25', '2026-06-25', { status: 'CONFIRMED' }),
        alice('2026-06-26', '2026-06-26', { status: 'PENDING' }),
      ],
      'en-GB',
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]!.anyPending).toBe(false);
    expect(segs[1]!.anyPending).toBe(true);
  });
});

describe('summariseSegment', () => {
  const seg = (rows: FeedRow[], locale: 'en-GB' | 'nb-NO') =>
    segmentByOccupancy(rows, locale)[0]!;

  it('uses the stayer name when one person stays', () => {
    const s = seg([alice('2026-06-25', '2026-06-26')], 'en-GB');
    expect(summariseSegment(s, 'Bekkeholt', 'en-GB')).toBe('Bekkeholt - Alice');
  });

  it('uses a generic label for several people (en + nb)', () => {
    const rows = [alice('2026-06-25', '2026-06-26'), bob('2026-06-25', '2026-06-26')];
    expect(summariseSegment(seg(rows, 'en-GB'), 'Bekkeholt', 'en-GB')).toBe(
      'Bekkeholt Booking',
    );
    expect(summariseSegment(seg(rows, 'nb-NO'), 'Bekkeholt', 'nb-NO')).toBe(
      'Bekkeholt - opphold',
    );
  });

  it('prefixes pending segments', () => {
    const s = seg([alice('2026-06-25', '2026-06-26', { status: 'PENDING' })], 'en-GB');
    expect(summariseSegment(s, 'Bekkeholt', 'en-GB')).toBe('[Tentative] Bekkeholt - Alice');
  });
});

describe('describeSegment', () => {
  it('groups occupants by room, ordered by room name', () => {
    const s = segmentByOccupancy(
      [
        alice('2026-06-25', '2026-06-26'),
        bob('2026-06-25', '2026-06-26'),
        // A second person in Alice's (Blue) room.
        row({
          userId: 'cara',
          participantName: 'Cara',
          roomId: 'roomA',
          roomNameEn: 'Blue',
          roomNameNb: 'Blå',
          startDate: '2026-06-25',
          endDate: '2026-06-26',
        }),
      ],
      'en-GB',
    )[0]!;
    expect(describeSegment(s)).toBe('Blue:\nAlice\nCara\n\nYellow:\nBob');
  });

  it('labels a full-cottage booking', () => {
    const s = segmentByOccupancy(
      [
        row({
          userId: 'alice',
          participantName: 'Alice',
          targetKind: 'FULL_COTTAGE',
          startDate: '2026-06-25',
          endDate: '2026-06-26',
        }),
      ],
      'en-GB',
    )[0]!;
    expect(describeSegment(s)).toBe('Whole cottage:\nAlice');
  });
});

describe('buildIcs', () => {
  const longEvent: IcsEvent = {
    uid: 'seg-x@hytta',
    summary: 'Bekkeholt Booking',
    description: 'Blue:\nAlice Andersen\nCara Carlsen\n\nYellow:\nBob Berg '.repeat(4),
    location: 'Fjellveien 12, 1234 Sometown',
    url: 'https://example.com/dashboard',
    startDate: '2026-06-25',
    endDate: '2026-06-27',
    createdAt: 1_700_000_000,
    status: 'CONFIRMED',
  };

  it('folds every physical line to <=75 octets', () => {
    const ics = buildIcs([longEvent], 'Bekkeholt — all bookings');
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('emits location, url and refresh hints', () => {
    const ics = buildIcs([longEvent], 'Bekkeholt');
    // Unfold for content assertions (folded lines rejoin on CRLF + space).
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('LOCATION:Fjellveien 12');
    expect(unfolded).toContain('URL:https://example.com/dashboard');
    expect(unfolded).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    expect(unfolded).toContain('X-PUBLISHED-TTL:PT1H');
  });
});
