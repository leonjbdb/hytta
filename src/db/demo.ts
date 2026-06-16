/**
 * Demo data loader — populates a LOCAL D1 database with a fictional, ready-to-
 * use cottage so the app can be explored end-to-end before deploying.
 *
 *   bun run db:migrate   # apply migrations to local D1 first
 *   bun run demo
 *
 * This is NOT what a real deployment starts with. A fresh deployment begins
 * completely empty: the operator names the cottage on the `/setup` screen,
 * becomes the first admin, then creates rooms in the UI. The only account a
 * real deployment may carry is the env-managed test user (TEST_USER_* — see
 * `.env.example` and `src/lib/bootstrap.ts`). Everything below is invented
 * placeholder content with `@example.com` addresses; none of it is personal.
 *
 * Additive & idempotent: every row uses a deterministic `demo-*` id, so
 * re-running adds the demo content to an existing instance without deleting
 * anything else. Demo accounts' password hash and demo reservations are
 * refreshed on every run so a changed `DEMO_PASSWORD`, relative dates, and
 * revised target assignments take effect without a reset. To start from a
 * clean slate instead, run `bun run db:reset` first.
 *
 * Guarded: the loader refuses production/CI-like environments and explicitly
 * disables Wrangler remote bindings, so it can only write to the local
 * Miniflare D1 store.
 *
 * Inserts:
 *   - cottage name "The Dwarfs' Cottage" (so the /setup gate is already satisfied)
 *   - 8 demo members, all sharing the same password (printed at the end)
 *   - 4 rooms (3 bed-based, 1 slot-based) with their beds, coloured from the
 *     real selectable palette (see ROOM_COLOR_PALETTE)
 *   - bookings covering every state across a relative past/future timeline:
 *     single- and multi-person stays, whole-cottage stays, busy partial/full
 *     cottage weekends, pending requests, and a cancelled one
 *   - invitations from the admin in every state: an open link, two awaiting a
 *     named recipient, an expired one, and a revoked one
 *   - a few dugnad (chores), one completed by someone other than its creator
 *   - two group templates (one with a guest member)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPlatformProxy, type GetPlatformProxyOptions } from 'wrangler';
import { drizzleFor, type DB } from './drizzle';
import {
  beds,
  cottageSettings,
  dugnadTasks,
  groupMembers,
  groupTemplates,
  invitations,
  reservations,
  rooms,
  users,
} from './schema';
import { hashPassword } from '@/lib/auth/password';

const COTTAGE_NAME = "The Dwarfs' Cottage";

const LOCAL_PLATFORM_PROXY_OPTIONS = {
  remoteBindings: false,
} satisfies GetPlatformProxyOptions;

const BLOCKED_ENV_VARS = ['CF_PAGES', 'CLOUDFLARE_ENV'] as const;
const DEMO_ENV = 'DEMO';

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const parsed: Record<string, string> = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;

    let value = (match[2] ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function isDemoEnv(): boolean {
  const fileEnv = parseEnvFile(resolve('.env.local'));
  return (process.env[DEMO_ENV] ?? fileEnv[DEMO_ENV] ?? '').trim().toLowerCase() === 'true';
}

function assertLocalDemoRun(): void {
  const blocked: string[] = BLOCKED_ENV_VARS.filter((name) =>
    Boolean(process.env[name]),
  );
  if (process.env.CI && process.env.CI !== 'false') blocked.push('CI');
  if (process.env.NODE_ENV === 'production') blocked.push('NODE_ENV=production');
  if (isDemoEnv()) blocked.push('DEMO=true');

  if (blocked.length > 0) {
    throw new Error(
      'Refusing to load demo data outside local development. ' +
        `Blocked by: ${blocked.join(', ')}. ` +
        'Use cache-only demo mode or the production /setup flow instead.',
    );
  }
}

/** Shared login for every demo account. Printed at the end of the run. */
const DEMO_PASSWORD = 'password';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ISO `YYYY-MM-DD`, `offsetDays` from today, so demo bookings stay relative. */
const iso = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

interface DemoUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
  isManager?: boolean;
}

const DEMO_USERS: DemoUser[] = [
  { id: 'demo-snow-white', email: 'snow.white@example.com', firstName: 'Snow', lastName: 'White', isAdmin: true, isManager: true },
  { id: 'demo-doc', email: 'doc@example.com', firstName: 'Doc', lastName: 'Chef' },
  { id: 'demo-grumpy', email: 'grumpy@example.com', firstName: 'Grumpy', lastName: 'Brummbär' },
  { id: 'demo-happy', email: 'happy@example.com', firstName: 'Happy', lastName: 'Happy' },
  { id: 'demo-sleepy', email: 'sleepy@example.com', firstName: 'Sleepy', lastName: 'Schlafmütz' },
  { id: 'demo-bashful', email: 'bashful@example.com', firstName: 'Bashful', lastName: 'Pimpel' },
  { id: 'demo-sneezy', email: 'sneezy@example.com', firstName: 'Sneezy', lastName: 'Hatschi' },
  { id: 'demo-dopey', email: 'dopey@example.com', firstName: 'Dopey', lastName: 'Seppl' },
];

interface DemoRoom {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  capacityMode: 'BEDS' | 'SLOTS';
  slotCount?: number | null;
  beds?: { id: string; kind: 'DOUBLE' | 'SINGLE'; label: string }[];
}

const DEMO_ROOMS: DemoRoom[] = [
  {
    id: 'demo-room-loft',
    nameNb: 'Loftet',
    nameEn: 'The Loft',
    icon: 'bed-double',
    color: '#3b82f6', // sky
    capacityMode: 'BEDS',
    beds: [
      { id: 'demo-bed-loft-d', kind: 'DOUBLE', label: 'LOFT-DOUBLE' },
      { id: 'demo-bed-loft-s', kind: 'SINGLE', label: 'LOFT-SINGLE' },
    ],
  },
  {
    id: 'demo-room-hems',
    nameNb: 'Hemsen',
    nameEn: 'The Mezzanine',
    icon: 'bed-single',
    color: '#14b8a6', // mint
    capacityMode: 'BEDS',
    beds: [
      { id: 'demo-bed-hems-1', kind: 'SINGLE', label: 'HEMS-1' },
      { id: 'demo-bed-hems-2', kind: 'SINGLE', label: 'HEMS-2' },
    ],
  },
  {
    id: 'demo-room-anneks',
    nameNb: 'Anneks',
    nameEn: 'The Annex',
    icon: 'tree',
    color: '#16a34a', // forest
    capacityMode: 'BEDS',
    beds: [{ id: 'demo-bed-anneks-d', kind: 'DOUBLE', label: 'ANNEX-DOUBLE' }],
  },
  {
    id: 'demo-room-stua',
    nameNb: 'Stua',
    nameEn: 'The Living Room',
    icon: 'sofa',
    color: '#f97316', // coral
    capacityMode: 'SLOTS',
    slotCount: 4,
  },
];

interface DemoBooking {
  id: string;
  /** Groups multiple participant rows into one booking. Defaults to `id` (the
   *  single-participant convention). Rows sharing a `bookingId` are one booking
   *  with several people. */
  bookingId?: string;
  bookerId: string;
  /** Participant: a user id, or a guest name (exactly one). */
  userId?: string;
  guestName?: string;
  targetKind: 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT';
  roomId?: string;
  bedId?: string;
  startOffset: number;
  endOffset: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

const HISTORICAL_DEMO_BOOKING_COUNT = 220;
const HISTORICAL_START_OFFSET = -760;
const HISTORICAL_STEP_DAYS = 2;
const DEMO_GUEST_NAMES = [
  'The Huntsman',
  'Woodland Friend',
  'Forest Visitor',
  'Castle Messenger',
] as const;

function demoUserIdAt(index: number): string {
  const user = DEMO_USERS[index % DEMO_USERS.length];
  if (!user) throw new Error(`Demo user index ${index} is out of range.`);
  return user.id;
}

function demoGuestNameAt(index: number): string {
  const guestName = DEMO_GUEST_NAMES[index % DEMO_GUEST_NAMES.length];
  if (!guestName) throw new Error(`Demo guest index ${index} is out of range.`);
  return guestName;
}

function generateHistoricalDemoBookings(): DemoBooking[] {
  const bookings: DemoBooking[] = [];

  for (let i = 0; i < HISTORICAL_DEMO_BOOKING_COUNT; i += 1) {
    const id = `demo-history-${String(i).padStart(3, '0')}`;
    const startOffset = HISTORICAL_START_OFFSET + i * HISTORICAL_STEP_DAYS;
    const endOffset = startOffset + 1;

    if (i % 20 === 0) {
      const userId = demoUserIdAt(i);
      bookings.push({
        id: `${id}-full`,
        bookerId: userId,
        userId,
        targetKind: 'FULL_COTTAGE',
        startOffset,
        endOffset,
        status: 'CONFIRMED',
      });
      continue;
    }

    if (i % 9 === 0) {
      bookings.push(
        { id: `${id}-loft`, bookingId: id, bookerId: 'demo-snow-white', userId: demoUserIdAt(i), targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset, endOffset, status: 'CONFIRMED' },
        { id: `${id}-hems`, bookingId: id, bookerId: 'demo-snow-white', userId: demoUserIdAt(i + 1), targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset, endOffset, status: 'CONFIRMED' },
        { id: `${id}-annex`, bookingId: id, bookerId: 'demo-snow-white', userId: demoUserIdAt(i + 2), targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset, endOffset, status: 'CONFIRMED' },
        { id: `${id}-stua`, bookingId: id, bookerId: 'demo-snow-white', guestName: demoGuestNameAt(i), targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset, endOffset, status: 'CONFIRMED' },
      );
      continue;
    }

    if (i % 5 === 0) {
      bookings.push(
        { id: `${id}-annex`, bookingId: id, bookerId: demoUserIdAt(i), userId: demoUserIdAt(i), targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset, endOffset, status: 'CONFIRMED' },
        { id: `${id}-stua`, bookingId: id, bookerId: demoUserIdAt(i), guestName: demoGuestNameAt(i), targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset, endOffset, status: 'CONFIRMED' },
      );
      continue;
    }

    const userId = demoUserIdAt(i);
    const pattern = i % 4;
    if (pattern === 0) {
      bookings.push({ id, bookerId: userId, userId, targetKind: 'BED', bedId: 'demo-bed-loft-s', startOffset, endOffset, status: 'CONFIRMED' });
    } else if (pattern === 1) {
      bookings.push({ id, bookerId: userId, userId, targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset, endOffset, status: 'CONFIRMED' });
    } else if (pattern === 2) {
      bookings.push({ id, bookerId: userId, userId, targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset, endOffset, status: 'CONFIRMED' });
    } else {
      bookings.push({ id, bookerId: userId, userId, targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset, endOffset, status: 'CONFIRMED' });
    }
  }

  return bookings;
}

const CURATED_DEMO_BOOKINGS: DemoBooking[] = [
  /* --- established past usage --- */
  // A whole-cottage winter stay by one member.
  { id: 'demo-res-full', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'FULL_COTTAGE', startOffset: -132, endOffset: -129, status: 'CONFIRMED' },

  // A busy old weekend where every area has someone in it.
  { id: 'demo-res-winter-loft', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },
  { id: 'demo-res-winter-hems', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },
  { id: 'demo-res-winter-annex', bookerId: 'demo-doc', guestName: 'The Huntsman', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },
  { id: 'demo-res-winter-stua', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },

  // Another whole-cottage stay by one person, a few weeks later.
  { id: 'demo-res-spring-full-doc', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'FULL_COTTAGE', startOffset: -94, endOffset: -91, status: 'CONFIRMED' },

  // Partial cottage use: a room and a slot at the same time.
  { id: 'demo-res-spring-annex', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: -72, endOffset: -70, status: 'CONFIRMED' },
  { id: 'demo-res-slot', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: -72, endOffset: -70, status: 'CONFIRMED' },

  // Two friends (guests, no accounts) sharing the annex's double bed (one each
  // side — a double sleeps two), booked together by Snow White.
  { id: 'demo-res-friends-1', bookingId: 'demo-bk-friends', bookerId: 'demo-snow-white', guestName: 'The Huntsman', targetKind: 'BED', bedId: 'demo-bed-anneks-d', startOffset: -48, endOffset: -46, status: 'CONFIRMED' },
  { id: 'demo-res-friends-2', bookingId: 'demo-bk-friends', bookerId: 'demo-snow-white', guestName: 'Woodland Friend', targetKind: 'BED', bedId: 'demo-bed-anneks-d', startOffset: -48, endOffset: -46, status: 'CONFIRMED' },

  // A recent partly used weekend across different areas.
  { id: 'demo-res-recent-loft', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: -28, endOffset: -26, status: 'CONFIRMED' },
  { id: 'demo-res-recent-hems', bookerId: 'demo-grumpy', guestName: 'Forest Visitor', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: -28, endOffset: -26, status: 'CONFIRMED' },

  /* --- future confirmed bookings --- */
  // A long weekend in one specific bed. Avoid whole-room rows for one member
  // here, because the occupancy UI can make that look like the same person is
  // assigned to multiple beds in the room.
  { id: 'demo-res-loft', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'BED', bedId: 'demo-bed-loft-s', startOffset: 5, endOffset: 8, status: 'CONFIRMED' },

  // A future whole-cottage stay by one member.
  { id: 'demo-res-summer-full-grumpy', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'FULL_COTTAGE', startOffset: 24, endOffset: 27, status: 'CONFIRMED' },

  // Another busy future weekend where every area has someone in it.
  { id: 'demo-res-future-loft', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },
  { id: 'demo-res-future-hems', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },
  { id: 'demo-res-future-annex', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },
  { id: 'demo-res-future-stua', bookerId: 'demo-doc', guestName: 'Woodland Friend', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },

  // A whole-cottage stay for three: two members and a guest.
  { id: 'demo-res-fam-snow-white', bookingId: 'demo-bk-fam', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },
  { id: 'demo-res-fam-grumpy', bookingId: 'demo-bk-fam', bookerId: 'demo-snow-white', userId: 'demo-grumpy', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },
  { id: 'demo-res-fam-guest', bookingId: 'demo-bk-fam', bookerId: 'demo-snow-white', guestName: 'Forest Visitor', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },

  /* --- pending requests --- */
  // A standalone request awaiting approval — conflicts with nothing.
  { id: 'demo-res-bed', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: 5, endOffset: 6, status: 'PENDING' },
  // Two requests that CONFLICT: same single bed, overlapping dates, both pending.
  { id: 'demo-res-conflict-a', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 14, endOffset: 17, status: 'PENDING' },
  { id: 'demo-res-conflict-b', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 15, endOffset: 18, status: 'PENDING' },

  /* --- a cancelled booking, for the cancelled state --- */
  { id: 'demo-res-cancelled', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'ROOM', roomId: 'demo-room-loft', startOffset: -4, endOffset: -2, status: 'CANCELLED' },
];

const DEMO_BOOKINGS: DemoBooking[] = [
  ...generateHistoricalDemoBookings(),
  ...CURATED_DEMO_BOOKINGS,
];

function offsetRangesOverlap(a: DemoBooking, b: DemoBooking): boolean {
  return a.startOffset <= b.endOffset && b.startOffset <= a.endOffset;
}

function demoUserName(userId: string): string {
  const user = DEMO_USERS.find((u) => u.id === userId);
  if (!user) throw new Error(`Demo booking references unknown user ${userId}`);
  return `${user.firstName} ${user.lastName}`;
}

function demoRoomById(roomId: string): DemoRoom {
  const room = DEMO_ROOMS.find((r) => r.id === roomId);
  if (!room) throw new Error(`Demo booking references unknown room ${roomId}`);
  return room;
}

function assertDemoBookingsAreConsistent(): void {
  const activeBookings = DEMO_BOOKINGS.filter((b) => b.status !== 'CANCELLED');
  if (!activeBookings.some((b) => b.endOffset < 0)) {
    throw new Error('Demo bookings must include at least one past active stay.');
  }
  if (!activeBookings.some((b) => b.startOffset > 0)) {
    throw new Error('Demo bookings must include at least one future active stay.');
  }
  const pastBookingIds = new Set(
    activeBookings
      .filter((b) => b.endOffset < 0)
      .map((b) => b.bookingId ?? b.id),
  );
  if (pastBookingIds.size < 200) {
    throw new Error('Demo bookings must include hundreds of past stays.');
  }

  const byUser = new Map<string, DemoBooking[]>();
  for (const booking of activeBookings) {
    if (booking.startOffset > booking.endOffset) {
      throw new Error(`Demo booking ${booking.id} ends before it starts.`);
    }
    if (booking.userId && booking.targetKind === 'ROOM') {
      if (!booking.roomId) {
        throw new Error(`Demo booking ${booking.id} is missing a room id.`);
      }
      const room = demoRoomById(booking.roomId);
      if (room.capacityMode === 'BEDS') {
        if (!room.beds) {
          throw new Error(`Demo room ${room.id} is missing bed metadata.`);
        }
        if (room.beds.length > 1) {
          throw new Error(
            `Demo booking ${booking.id} puts ${demoUserName(booking.userId)} in a whole multi-bed room. Use a BED target instead.`,
          );
        }
      }
    }
    if (!booking.userId) continue;

    const existingBookings = byUser.get(booking.userId);
    if (existingBookings) {
      for (const existing of existingBookings) {
        if (!offsetRangesOverlap(booking, existing)) continue;
        throw new Error(
          `Demo bookings ${existing.id} and ${booking.id} overlap for ${demoUserName(booking.userId)}.`,
        );
      }
      existingBookings.push(booking);
    } else {
      byUser.set(booking.userId, [booking]);
    }
  }
}

interface DemoDugnad {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  completedBy?: string;
  completedDaysAgo?: number;
}

const DEMO_DUGNAD: DemoDugnad[] = [
  {
    id: 'demo-dugnad-bod',
    title: 'Rydde og feie i boden',
    description:
      'Boden trenger en opprydding før sesongen. Sorter verktøy, fe'
      + 'i gulvet og kast det som er ødelagt. Regn med en times tid.',
    createdBy: 'demo-snow-white',
  },
  {
    id: 'demo-dugnad-roykvarsler',
    title: 'Sjekke røykvarslere og brannslukker',
    description:
      'Test alle røykvarslerne og bytt batteri ved behov. Sjekk at '
      + 'brannslukkeren ikke er utgått. Nye batterier ligger i kjøkkenskuffen.',
    createdBy: 'demo-doc',
    completedBy: 'demo-doc',
    completedDaysAgo: 9,
  },
  {
    id: 'demo-dugnad-veranda',
    title: 'Koste verandaen og sette ut hagemøblene',
    description:
      'Kost bort vinterskitt fra verandaen og hent hagemøblene fram fra boden. '
      + 'Putene ligger i den blå plastkassen.',
    createdBy: 'demo-grumpy',
    // Completed by someone other than the creator — exercises the "done, by
    // another member" state (and the relaxed dugnad_completed_shape check).
    completedBy: 'demo-happy',
    completedDaysAgo: 3,
  },
  {
    id: 'demo-dugnad-vann',
    title: 'Åpne for vannet og sjekke for lekkasjer',
    description:
      'Skru på hovedstoppekranen, slipp opp lufta i springene og se etter '
      + 'lekkasjer under vasken og ved varmtvannsberederen.',
    createdBy: 'demo-snow-white',
  },
];

interface DemoGroupMember {
  id: string;
  /** A registered user OR a guest name — exactly one. */
  userId?: string;
  guestName?: string;
  preferredRoomId?: string;
  preferredBedId?: string;
}

interface DemoGroup {
  id: string;
  name: string;
  createdBy: string;
  members: DemoGroupMember[];
}

const DEMO_GROUPS: DemoGroup[] = [
  // Member ids match the original single-group seed so re-running doesn't add
  // duplicate rows to an already-seeded instance.
  {
    id: 'demo-group-fam',
    name: 'Cottage Household',
    createdBy: 'demo-snow-white',
    members: [
      { id: 'demo-gm-snow-white', userId: 'demo-snow-white', preferredRoomId: 'demo-room-loft' },
      { id: 'demo-gm-doc', userId: 'demo-doc', preferredRoomId: 'demo-room-hems' },
      { id: 'demo-gm-grumpy', userId: 'demo-grumpy', preferredRoomId: 'demo-room-anneks' },
    ],
  },
  // A second group with a guest member, to exercise mixed user/guest groups.
  {
    id: 'demo-group-venner',
    name: 'Mine Crew',
    createdBy: 'demo-doc',
    members: [
      { id: 'demo-gm-crew-doc', userId: 'demo-doc', preferredRoomId: 'demo-room-loft', preferredBedId: 'demo-bed-loft-s' },
      { id: 'demo-gm-crew-happy', userId: 'demo-happy', preferredRoomId: 'demo-room-stua' },
      { id: 'demo-gm-crew-guest', guestName: 'Woodland Friend' },
    ],
  },
];

interface DemoInvite {
  id: string;
  token: string;
  /** Pre-bound recipient address; omit for an open shareable link. */
  email?: string;
  /** Null/omit = unlimited multi-use; otherwise the cap. */
  maxUses?: number | null;
  useCount?: number;
  /** Days from now until expiry; negative = already expired. */
  expiresInDays: number;
  /** Days ago it was revoked; omit for active invites. */
  revokedDaysAgo?: number;
}

// Every invite is sent by the admin (Snow White), covering each lifecycle state.
const DEMO_INVITES: DemoInvite[] = [
  // An open, shareable multi-use link — partly used, still active.
  { id: 'demo-inv-link', token: 'demo-invite-open-link', maxUses: 10, useCount: 3, expiresInDays: 30 },
  // Email-bound invites awaiting their recipient (single-use, unused).
  { id: 'demo-inv-huntsman', token: 'demo-invite-huntsman', email: 'huntsman@example.com', maxUses: 1, useCount: 0, expiresInDays: 14 },
  { id: 'demo-inv-forest-friend', token: 'demo-invite-forest-friend', email: 'forest.friend@example.com', maxUses: 1, useCount: 0, expiresInDays: 14 },
  // An expired invite that was never accepted.
  { id: 'demo-inv-expired', token: 'demo-invite-expired', email: 'old.invite@example.com', maxUses: 1, useCount: 0, expiresInDays: -3 },
  // A revoked invite.
  { id: 'demo-inv-revoked', token: 'demo-invite-revoked', maxUses: 5, useCount: 1, expiresInDays: 30, revokedDaysAgo: 1 },
];

async function loadCottage(db: DB): Promise<void> {
  await db
    .insert(cottageSettings)
    .values({ id: 'singleton', name: COTTAGE_NAME })
    .onConflictDoNothing({ target: cottageSettings.id })
    .run();
}

async function loadUsers(db: DB): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    await db
      .insert(users)
      .values({
        id: u.id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash,
        emailVerified: new Date(),
        isAdmin: u.isAdmin ?? false,
        isManager: u.isManager ?? false,
        isInvitee: true,
        notifyEnabled: true,
        firstLoginCompletedAt: Math.floor(Date.now() / 1000),
      })
      // Refresh the password on re-run so a changed DEMO_PASSWORD applies to
      // already-seeded demo accounts; everything else is left untouched.
      .onConflictDoUpdate({ target: users.id, set: { passwordHash } })
      .run();
  }
}

async function loadRoomsAndBeds(db: DB): Promise<void> {
  for (const r of DEMO_ROOMS) {
    await db
      .insert(rooms)
      .values({
        id: r.id,
        nameNb: r.nameNb,
        nameEn: r.nameEn,
        icon: r.icon,
        color: r.color,
        capacityMode: r.capacityMode,
        slotCount: r.slotCount ?? null,
      })
      .onConflictDoNothing({ target: rooms.id })
      .run();
    for (const b of r.beds ?? []) {
      await db
        .insert(beds)
        .values({ id: b.id, roomId: r.id, kind: b.kind, label: b.label })
        .onConflictDoNothing({ target: beds.id })
        .run();
    }
  }
}

async function loadBookings(db: DB): Promise<void> {
  assertDemoBookingsAreConsistent();
  for (const b of DEMO_BOOKINGS) {
    const row = {
      id: b.id,
      // Rows sharing a bookingId are one booking; single-person rows default
      // their bookingId to their own row id.
      bookingId: b.bookingId ?? b.id,
      bookerId: b.bookerId,
      userId: b.userId ?? null,
      guestName: b.guestName ?? null,
      targetKind: b.targetKind,
      roomId: b.roomId ?? null,
      bedId: b.bedId ?? null,
      startDate: iso(b.startOffset),
      endDate: iso(b.endOffset),
      status: b.status,
    };

    await db
      .insert(reservations)
      .values(row)
      .onConflictDoUpdate({
        target: reservations.id,
        set: {
          bookingId: row.bookingId,
          bookerId: row.bookerId,
          userId: row.userId,
          guestName: row.guestName,
          targetKind: row.targetKind,
          roomId: row.roomId,
          bedId: row.bedId,
          startDate: row.startDate,
          endDate: row.endDate,
          status: row.status,
        },
      })
      .run();
  }
}

async function loadDugnad(db: DB): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const d of DEMO_DUGNAD) {
    const completed = d.completedBy
      ? {
          completedBy: d.completedBy,
          completedAt: nowSec - (d.completedDaysAgo ?? 1) * 24 * 60 * 60,
        }
      : { completedBy: null, completedAt: null };
    await db
      .insert(dugnadTasks)
      .values({
        id: d.id,
        title: d.title,
        description: d.description,
        createdBy: d.createdBy,
        ...completed,
      })
      .onConflictDoNothing({ target: dugnadTasks.id })
      .run();
  }
}

async function loadGroups(db: DB): Promise<void> {
  for (const g of DEMO_GROUPS) {
    await db
      .insert(groupTemplates)
      .values({ id: g.id, name: g.name, createdBy: g.createdBy })
      .onConflictDoNothing({ target: groupTemplates.id })
      .run();
    for (const [position, m] of g.members.entries()) {
      await db
        .insert(groupMembers)
        .values({
          id: m.id,
          groupId: g.id,
          userId: m.userId ?? null,
          guestName: m.guestName ?? null,
          preferredRoomId: m.preferredRoomId ?? null,
          preferredBedId: m.preferredBedId ?? null,
          position,
        })
        .onConflictDoNothing({ target: groupMembers.id })
        .run();
    }
  }
}

async function loadInvites(db: DB): Promise<void> {
  for (const inv of DEMO_INVITES) {
    await db
      .insert(invitations)
      .values({
        id: inv.id,
        token: inv.token,
        createdBy: 'demo-snow-white',
        maxUses: inv.maxUses ?? null,
        useCount: inv.useCount ?? 0,
        email: inv.email ?? null,
        expiresAt: new Date(Date.now() + inv.expiresInDays * DAY_MS),
        revokedAt:
          inv.revokedDaysAgo != null ? new Date(Date.now() - inv.revokedDaysAgo * DAY_MS) : null,
      })
      .onConflictDoNothing({ target: invitations.id })
      .run();
  }
}

async function main() {
  assertLocalDemoRun();
  const platform = await getPlatformProxy<CloudflareEnv>(LOCAL_PLATFORM_PROXY_OPTIONS);
  if (!platform.env.DB) {
    throw new Error('Missing local D1 binding DB for demo loader.');
  }
  const db = drizzleFor(platform.env.DB);
  try {
    console.log('[demo] cottage…');
    await loadCottage(db);
    console.log('[demo] users…');
    await loadUsers(db);
    console.log('[demo] rooms + beds…');
    await loadRoomsAndBeds(db);
    console.log('[demo] bookings…');
    await loadBookings(db);
    console.log('[demo] dugnad…');
    await loadDugnad(db);
    console.log('[demo] groups…');
    await loadGroups(db);
    console.log('[demo] invitations…');
    await loadInvites(db);
    console.log(`\n[demo] done — cottage "${COTTAGE_NAME}" is ready.`);
    console.log('[demo] sign in with any of:');
    for (const u of DEMO_USERS) {
      const role = u.isAdmin ? ' (admin)' : u.isManager ? ' (manager)' : '';
      console.log(`         ${u.email}${role}`);
    }
    console.log(`[demo] password for all: ${DEMO_PASSWORD}`);
  } finally {
    await platform.dispose();
  }
}

main().catch((err) => {
  console.error('[demo] failed:', err);
  process.exit(1);
});
