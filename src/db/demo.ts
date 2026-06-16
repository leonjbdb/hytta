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
 * Additive & idempotent: every row uses a deterministic `demo-*` id and is
 * inserted with `onConflictDoNothing`, so re-running adds the demo content to
 * an existing instance without deleting or replacing anything else. The one
 * exception is the demo accounts' password hash, which is refreshed on every
 * run so a changed `DEMO_PASSWORD` takes effect without a reset. To start from
 * a clean slate instead, run `bun run db:reset` first.
 *
 * Guarded: the loader refuses production/CI-like environments and explicitly
 * disables Wrangler remote bindings, so it can only write to the local
 * Miniflare D1 store.
 *
 * Inserts:
 *   - cottage name "Granheim" (so the /setup gate is already satisfied)
 *   - 4 demo members, all sharing the same password (printed at the end)
 *   - 4 rooms (3 bed-based, 1 slot-based) with their beds, coloured from the
 *     real selectable palette (see ROOM_COLOR_PALETTE)
 *   - bookings covering every state: single- and multi-person stays, a two-
 *     guest stay, a standalone pending request, two conflicting pending
 *     requests, and a cancelled one
 *   - invitations from the admin in every state: an open link, two awaiting a
 *     named recipient, an expired one, and a revoked one
 *   - a few dugnad (chores), one completed by someone other than its creator
 *   - two group templates (one with a guest member)
 */
import { getPlatformProxy, type GetPlatformProxyOptions } from 'wrangler';
import { drizzleFor, type DB } from './client';
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

const COTTAGE_NAME = 'Granheim';

const LOCAL_PLATFORM_PROXY_OPTIONS = {
  remoteBindings: false,
} satisfies GetPlatformProxyOptions;

const BLOCKED_ENV_VARS = ['CF_PAGES', 'CLOUDFLARE_ENV'] as const;

function assertLocalDemoRun(): void {
  const blocked: string[] = BLOCKED_ENV_VARS.filter((name) =>
    Boolean(process.env[name]),
  );
  if (process.env.CI && process.env.CI !== 'false') blocked.push('CI');
  if (process.env.NODE_ENV === 'production') blocked.push('NODE_ENV=production');

  if (blocked.length > 0) {
    throw new Error(
      'Refusing to load demo data outside local development. ' +
        `Blocked by: ${blocked.join(', ')}. ` +
        'Use the production /setup flow instead.',
    );
  }
}

/** Shared login for every demo account. Printed at the end of the run. */
const DEMO_PASSWORD = 'password';

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

const DEMO_BOOKINGS: DemoBooking[] = [
  /* --- single-person bookings --- */
  // A whole room for a long weekend.
  { id: 'demo-res-loft', bookerId: 'demo-henrik', userId: 'demo-henrik', targetKind: 'ROOM', roomId: 'demo-room-loft', startOffset: 5, endOffset: 8, status: 'CONFIRMED' },
  // The whole cottage for a week, booked by the admin.
  { id: 'demo-res-full', bookerId: 'demo-astrid', userId: 'demo-astrid', targetKind: 'FULL_COTTAGE', startOffset: 20, endOffset: 27, status: 'CONFIRMED' },
  // A slot in the slots-mode living room.
  { id: 'demo-res-slot', bookerId: 'demo-jonas', userId: 'demo-jonas', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: 6, endOffset: 7, status: 'CONFIRMED' },

  /* --- multi-person bookings (rows share a bookingId) --- */
  // Two friends (guests, no accounts) sharing the annex, booked by the admin.
  { id: 'demo-res-friends-1', bookingId: 'demo-bk-friends', bookerId: 'demo-astrid', guestName: 'Ola Nordmann', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: 5, endOffset: 8, status: 'CONFIRMED' },
  { id: 'demo-res-friends-2', bookingId: 'demo-bk-friends', bookerId: 'demo-astrid', guestName: 'Kari Berg', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: 5, endOffset: 8, status: 'CONFIRMED' },
  // A whole-cottage stay for three: two members and a guest.
  { id: 'demo-res-fam-astrid', bookingId: 'demo-bk-fam', bookerId: 'demo-astrid', userId: 'demo-astrid', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },
  { id: 'demo-res-fam-maja', bookingId: 'demo-bk-fam', bookerId: 'demo-astrid', userId: 'demo-maja', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },
  { id: 'demo-res-fam-guest', bookingId: 'demo-bk-fam', bookerId: 'demo-astrid', guestName: 'Per Lie', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },

  /* --- pending requests --- */
  // A standalone request awaiting approval — conflicts with nothing.
  { id: 'demo-res-bed', bookerId: 'demo-maja', userId: 'demo-maja', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: 5, endOffset: 6, status: 'PENDING' },
  // Two requests that CONFLICT: same single bed, overlapping dates, both pending.
  { id: 'demo-res-conflict-a', bookerId: 'demo-henrik', userId: 'demo-henrik', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 14, endOffset: 17, status: 'PENDING' },
  { id: 'demo-res-conflict-b', bookerId: 'demo-jonas', userId: 'demo-jonas', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 15, endOffset: 18, status: 'PENDING' },

  /* --- a cancelled booking, for the cancelled state --- */
  { id: 'demo-res-cancelled', bookerId: 'demo-jonas', userId: 'demo-jonas', targetKind: 'ROOM', roomId: 'demo-room-loft', startOffset: 70, endOffset: 72, status: 'CANCELLED' },
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
    name: 'Familien Solberg',
    createdBy: 'demo-astrid',
    members: [
      { id: 'demo-gm-astrid', userId: 'demo-astrid', preferredRoomId: 'demo-room-loft' },
      { id: 'demo-gm-henrik', userId: 'demo-henrik', preferredRoomId: 'demo-room-hems' },
      { id: 'demo-gm-maja', userId: 'demo-maja', preferredRoomId: 'demo-room-anneks' },
    ],
  },
  // A second group with a guest member, to exercise mixed user/guest groups.
  {
    id: 'demo-group-venner',
    name: 'Vennegjengen',
    createdBy: 'demo-henrik',
    members: [
      { id: 'demo-gm-venner-henrik', userId: 'demo-henrik', preferredRoomId: 'demo-room-loft', preferredBedId: 'demo-bed-loft-s' },
      { id: 'demo-gm-venner-jonas', userId: 'demo-jonas', preferredRoomId: 'demo-room-stua' },
      { id: 'demo-gm-venner-guest', guestName: 'Kari Berg' },
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

// Every invite is sent by the admin (Astrid), covering each lifecycle state.
const DEMO_INVITES: DemoInvite[] = [
  // An open, shareable multi-use link — partly used, still active.
  { id: 'demo-inv-link', token: 'demo-invite-open-link', maxUses: 10, useCount: 3, expiresInDays: 30 },
  // Email-bound invites awaiting their recipient (single-use, unused).
  { id: 'demo-inv-kari', token: 'demo-invite-kari', email: 'kari@example.com', maxUses: 1, useCount: 0, expiresInDays: 14 },
  { id: 'demo-inv-per', token: 'demo-invite-per', email: 'per@example.com', maxUses: 1, useCount: 0, expiresInDays: 14 },
  // An expired invite that was never accepted.
  { id: 'demo-inv-expired', token: 'demo-invite-expired', email: 'gammel@example.com', maxUses: 1, useCount: 0, expiresInDays: -3 },
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
  for (const b of DEMO_BOOKINGS) {
    await db
      .insert(reservations)
      .values({
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
        createdBy: 'demo-astrid',
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
