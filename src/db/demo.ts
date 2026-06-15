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
 * Idempotent: every row uses a deterministic `demo-*` id and inserts with
 * `onConflictDoNothing`, so re-running adds nothing. To start over, run
 * `bun run db:reset` first.
 *
 * Inserts:
 *   - cottage name "Granheim" (so the /setup gate is already satisfied)
 *   - 4 demo members, all sharing the same password (printed at the end)
 *   - 4 rooms (3 bed-based, 1 slot-based) with their beds
 *   - 5 upcoming bookings spanning room / bed / slot / whole-cottage / guest
 *   - a few dugnad (chores), one completed by someone other than its creator
 *   - one group template
 */
import { getPlatformProxy } from 'wrangler';
import { drizzleFor, type DB } from './client';
import {
  beds,
  cottageSettings,
  dugnadTasks,
  groupMembers,
  groupTemplates,
  reservations,
  rooms,
  users,
} from './schema';
import { hashPassword } from '@/lib/auth/password';

const COTTAGE_NAME = 'Granheim';

/** Shared login for every demo account. Printed at the end of the run. */
const DEMO_PASSWORD = 'demohytta2026';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ISO `YYYY-MM-DD`, `offsetDays` from today, so bookings are always upcoming. */
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
  { id: 'demo-astrid', email: 'astrid@example.com', firstName: 'Astrid', lastName: 'Solberg', isAdmin: true, isManager: true },
  { id: 'demo-henrik', email: 'henrik@example.com', firstName: 'Henrik', lastName: 'Dahl' },
  { id: 'demo-maja', email: 'maja@example.com', firstName: 'Maja', lastName: 'Lindqvist' },
  { id: 'demo-jonas', email: 'jonas@example.com', firstName: 'Jonas', lastName: 'Vik' },
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
    color: '#0ea5e9',
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
    color: '#14b8a6',
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
    color: '#22c55e',
    capacityMode: 'BEDS',
    beds: [{ id: 'demo-bed-anneks-d', kind: 'DOUBLE', label: 'ANNEX-DOUBLE' }],
  },
  {
    id: 'demo-room-stua',
    nameNb: 'Stua',
    nameEn: 'The Living Room',
    icon: 'sofa',
    color: '#f59e0b',
    capacityMode: 'SLOTS',
    slotCount: 4,
  },
];

interface DemoBooking {
  id: string;
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

const DEMO_BOOKINGS: DemoBooking[] = [
  // A whole room for a long weekend.
  { id: 'demo-res-loft', bookerId: 'demo-henrik', userId: 'demo-henrik', targetKind: 'ROOM', roomId: 'demo-room-loft', startOffset: 5, endOffset: 8, status: 'CONFIRMED' },
  // The whole cottage for a week, booked by the admin.
  { id: 'demo-res-full', bookerId: 'demo-astrid', userId: 'demo-astrid', targetKind: 'FULL_COTTAGE', startOffset: 20, endOffset: 27, status: 'CONFIRMED' },
  // A single bed request still awaiting manager approval (Astrid is a manager).
  { id: 'demo-res-bed', bookerId: 'demo-maja', userId: 'demo-maja', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: 5, endOffset: 6, status: 'PENDING' },
  // A guest (no account) booked into the annex by the admin.
  { id: 'demo-res-guest', bookerId: 'demo-astrid', guestName: 'Besteforeldrene', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: 5, endOffset: 8, status: 'CONFIRMED' },
  // A slot in the slots-mode living room.
  { id: 'demo-res-slot', bookerId: 'demo-jonas', userId: 'demo-jonas', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: 6, endOffset: 7, status: 'CONFIRMED' },
];

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
    createdBy: 'demo-astrid',
  },
  {
    id: 'demo-dugnad-roykvarsler',
    title: 'Sjekke røykvarslere og brannslukker',
    description:
      'Test alle røykvarslerne og bytt batteri ved behov. Sjekk at '
      + 'brannslukkeren ikke er utgått. Nye batterier ligger i kjøkkenskuffen.',
    createdBy: 'demo-henrik',
    completedBy: 'demo-henrik',
    completedDaysAgo: 9,
  },
  {
    id: 'demo-dugnad-veranda',
    title: 'Koste verandaen og sette ut hagemøblene',
    description:
      'Kost bort vinterskitt fra verandaen og hent hagemøblene fram fra boden. '
      + 'Putene ligger i den blå plastkassen.',
    createdBy: 'demo-maja',
    // Completed by someone other than the creator — exercises the "done, by
    // another member" state (and the relaxed dugnad_completed_shape check).
    completedBy: 'demo-jonas',
    completedDaysAgo: 3,
  },
  {
    id: 'demo-dugnad-vann',
    title: 'Åpne for vannet og sjekke for lekkasjer',
    description:
      'Skru på hovedstoppekranen, slipp opp lufta i springene og se etter '
      + 'lekkasjer under vasken og ved varmtvannsberederen.',
    createdBy: 'demo-astrid',
  },
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
      })
      .onConflictDoNothing({ target: users.id })
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
  for (const b of DEMO_BOOKINGS) {
    await db
      .insert(reservations)
      .values({
        id: b.id,
        // Single-target bookings set bookingId to their own row id by convention.
        bookingId: b.id,
        bookerId: b.bookerId,
        userId: b.userId ?? null,
        guestName: b.guestName ?? null,
        targetKind: b.targetKind,
        roomId: b.roomId ?? null,
        bedId: b.bedId ?? null,
        startDate: iso(b.startOffset),
        endDate: iso(b.endOffset),
        status: b.status,
      })
      .onConflictDoNothing({ target: reservations.id })
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

async function loadGroup(db: DB): Promise<void> {
  await db
    .insert(groupTemplates)
    .values({ id: 'demo-group-fam', name: 'Familien Solberg', createdBy: 'demo-astrid' })
    .onConflictDoNothing({ target: groupTemplates.id })
    .run();
  const members = [
    { id: 'demo-gm-astrid', userId: 'demo-astrid', preferredRoomId: 'demo-room-loft', position: 0 },
    { id: 'demo-gm-henrik', userId: 'demo-henrik', preferredRoomId: 'demo-room-hems', position: 1 },
    { id: 'demo-gm-maja', userId: 'demo-maja', preferredRoomId: 'demo-room-anneks', position: 2 },
  ];
  for (const m of members) {
    await db
      .insert(groupMembers)
      .values({
        id: m.id,
        groupId: 'demo-group-fam',
        userId: m.userId,
        preferredRoomId: m.preferredRoomId,
        position: m.position,
      })
      .onConflictDoNothing({ target: groupMembers.id })
      .run();
  }
}

async function main() {
  const platform = await getPlatformProxy<CloudflareEnv>();
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
    console.log('[demo] group template…');
    await loadGroup(db);
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
