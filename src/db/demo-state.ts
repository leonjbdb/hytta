import { demoPasswordHashFor } from '@/lib/demo-password-hashes';
import type { BedKind, ReservationStatus, RoomCapacityMode, TargetKind } from './schema';

export const DEMO_COTTAGE_NAME = "The Dwarfs' Cottage";
export const DEMO_STATE_VERSION = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(nowMs: number, offsetDays: number): string {
  return new Date(nowMs + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export interface DemoState {
  users: DemoUserRow[];
  accounts: DemoAccountRow[];
  sessions: DemoSessionRow[];
  verificationTokens: DemoVerificationTokenRow[];
  passwordResetTokens: DemoPasswordResetTokenRow[];
  cottageSettings: DemoCottageSettingsRow[];
  rooms: DemoRoomRow[];
  beds: DemoBedRow[];
  groupTemplates: DemoGroupTemplateRow[];
  groupMembers: DemoGroupMemberRow[];
  dugnadTasks: DemoDugnadTaskRow[];
  reservations: DemoReservationRow[];
  invitations: DemoInvitationRow[];
}

export interface DemoUserRow {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  emailVerified: number | null;
  image: string | null;
  passwordHash: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isInvitee: boolean;
  notifyEnabled: boolean;
  notifyBooking: boolean;
  notifyRequests: boolean;
  firstLoginCompletedAt: number | null;
  calendarToken: string | null;
  createdAt: number;
}

export interface DemoAccountRow {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
}

export interface DemoSessionRow {
  sessionToken: string;
  userId: string;
  expires: number;
}

export interface DemoVerificationTokenRow {
  identifier: string;
  token: string;
  expires: number;
}

export interface DemoPasswordResetTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  consumedAt: number | null;
  createdAt: number;
}

export interface DemoCottageSettingsRow {
  id: 'singleton';
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DemoRoomRow {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  capacityMode: RoomCapacityMode;
  slotCount: number | null;
  createdAt: number;
}

export interface DemoBedRow {
  id: string;
  roomId: string;
  kind: BedKind;
  label: string;
  createdAt: number;
}

export interface DemoGroupTemplateRow {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: number;
}

export interface DemoGroupMemberRow {
  id: string;
  groupId: string;
  userId: string | null;
  guestName: string | null;
  preferredRoomId: string | null;
  preferredBedId: string | null;
  position: number;
  createdAt: number;
}

export interface DemoDugnadTaskRow {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: number;
  completedBy: string | null;
  completedAt: number | null;
}

export interface DemoReservationRow {
  id: string;
  bookingId: string | null;
  bookerId: string | null;
  userId: string | null;
  guestName: string | null;
  targetKind: TargetKind;
  roomId: string | null;
  bedId: string | null;
  startDate: string;
  endDate: string;
  status: ReservationStatus;
  createdAt: number;
}

export interface DemoInvitationRow {
  id: string;
  token: string;
  createdBy: string;
  maxUses: number | null;
  useCount: number;
  email: string | null;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
}

interface DemoUserSeed {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
  isManager?: boolean;
}

const DEMO_USERS: DemoUserSeed[] = [
  {
    id: 'demo-snow-white',
    email: 'snow.white@example.com',
    firstName: 'Snow',
    lastName: 'White',
    isAdmin: true,
    isManager: true,
  },
  { id: 'demo-doc', email: 'doc@example.com', firstName: 'Doc', lastName: 'Chef' },
  { id: 'demo-grumpy', email: 'grumpy@example.com', firstName: 'Grumpy', lastName: 'Brummbär' },
  { id: 'demo-happy', email: 'happy@example.com', firstName: 'Happy', lastName: 'Happy' },
  { id: 'demo-sleepy', email: 'sleepy@example.com', firstName: 'Sleepy', lastName: 'Schlafmütz' },
  { id: 'demo-bashful', email: 'bashful@example.com', firstName: 'Bashful', lastName: 'Pimpel' },
  { id: 'demo-sneezy', email: 'sneezy@example.com', firstName: 'Sneezy', lastName: 'Hatschi' },
  { id: 'demo-dopey', email: 'dopey@example.com', firstName: 'Dopey', lastName: 'Seppl' },
];

interface DemoRoomSeed {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  capacityMode: RoomCapacityMode;
  slotCount?: number | null;
  beds?: { id: string; kind: BedKind; label: string }[];
}

const DEMO_ROOMS: DemoRoomSeed[] = [
  {
    id: 'demo-room-loft',
    nameNb: 'Snøhvits kammer',
    nameEn: "Snow White's Chamber",
    icon: 'heart',
    color: '#dc2626',
    capacityMode: 'BEDS',
    beds: [
      { id: 'demo-bed-loft-d', kind: 'DOUBLE', label: 'APPLE-RED' },
      { id: 'demo-bed-loft-s', kind: 'SINGLE', label: 'FOREST-NOOK' },
    ],
  },
  {
    id: 'demo-room-hems',
    nameNb: 'Dvergenes sovesal',
    nameEn: "The Dwarfs' Bunkroom",
    icon: 'bed-single',
    color: '#ca8a04',
    capacityMode: 'BEDS',
    beds: [
      { id: 'demo-bed-hems-1', kind: 'SINGLE', label: 'PICKAXE-1' },
      { id: 'demo-bed-hems-2', kind: 'SINGLE', label: 'PICKAXE-2' },
    ],
  },
  {
    id: 'demo-room-anneks',
    nameNb: 'Docs verksted',
    nameEn: "Doc's Workshop",
    icon: 'sparkles',
    color: '#7c3aed',
    capacityMode: 'BEDS',
    beds: [{ id: 'demo-bed-anneks-d', kind: 'DOUBLE', label: 'WORKBENCH-COT' }],
  },
  {
    id: 'demo-room-stua',
    nameNb: 'Peisestua',
    nameEn: 'The Hearth Room',
    icon: 'sofa',
    color: '#ea580c',
    capacityMode: 'SLOTS',
    slotCount: 4,
  },
  {
    id: 'demo-room-mine',
    nameNb: 'Gruvegangen',
    nameEn: 'The Mine Tunnel',
    icon: 'mountain',
    color: '#64748b',
    capacityMode: 'SLOTS',
    slotCount: 6,
  },
  {
    id: 'demo-room-forest',
    nameNb: 'Eventyrskogen',
    nameEn: 'The Enchanted Forest',
    icon: 'tree',
    color: '#16a34a',
    capacityMode: 'SLOTS',
    slotCount: null,
  },
  {
    id: 'demo-room-well',
    nameNb: 'Ønskebrønnen',
    nameEn: 'The Wishing Well',
    icon: 'waves',
    color: '#0ea5e9',
    capacityMode: 'SLOTS',
    slotCount: 3,
  },
];

interface DemoBookingSeed {
  id: string;
  bookingId?: string;
  bookerId: string;
  userId?: string;
  guestName?: string;
  targetKind: TargetKind;
  roomId?: string;
  bedId?: string;
  startOffset: number;
  endOffset: number;
  status: ReservationStatus;
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

function generateHistoricalDemoBookings(): DemoBookingSeed[] {
  const bookings: DemoBookingSeed[] = [];

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
        {
          id: `${id}-loft`,
          bookingId: id,
          bookerId: 'demo-snow-white',
          userId: demoUserIdAt(i),
          targetKind: 'BED',
          bedId: 'demo-bed-loft-d',
          startOffset,
          endOffset,
          status: 'CONFIRMED',
        },
        {
          id: `${id}-hems`,
          bookingId: id,
          bookerId: 'demo-snow-white',
          userId: demoUserIdAt(i + 1),
          targetKind: 'BED',
          bedId: 'demo-bed-hems-1',
          startOffset,
          endOffset,
          status: 'CONFIRMED',
        },
        {
          id: `${id}-annex`,
          bookingId: id,
          bookerId: 'demo-snow-white',
          userId: demoUserIdAt(i + 2),
          targetKind: 'ROOM',
          roomId: 'demo-room-anneks',
          startOffset,
          endOffset,
          status: 'CONFIRMED',
        },
        {
          id: `${id}-stua`,
          bookingId: id,
          bookerId: 'demo-snow-white',
          guestName: demoGuestNameAt(i),
          targetKind: 'SLOT',
          roomId: 'demo-room-stua',
          startOffset,
          endOffset,
          status: 'CONFIRMED',
        },
      );
      continue;
    }

    if (i % 5 === 0) {
      const userId = demoUserIdAt(i);
      bookings.push(
        {
          id: `${id}-annex`,
          bookingId: id,
          bookerId: userId,
          userId,
          targetKind: 'ROOM',
          roomId: 'demo-room-anneks',
          startOffset,
          endOffset,
          status: 'CONFIRMED',
        },
        {
          id: `${id}-stua`,
          bookingId: id,
          bookerId: userId,
          guestName: demoGuestNameAt(i),
          targetKind: 'SLOT',
          roomId: 'demo-room-stua',
          startOffset,
          endOffset,
          status: 'CONFIRMED',
        },
      );
      continue;
    }

    const userId = demoUserIdAt(i);
    const pattern = i % 4;
    if (pattern === 0) {
      bookings.push({
        id,
        bookerId: userId,
        userId,
        targetKind: 'BED',
        bedId: 'demo-bed-loft-s',
        startOffset,
        endOffset,
        status: 'CONFIRMED',
      });
    } else if (pattern === 1) {
      bookings.push({
        id,
        bookerId: userId,
        userId,
        targetKind: 'BED',
        bedId: 'demo-bed-hems-2',
        startOffset,
        endOffset,
        status: 'CONFIRMED',
      });
    } else if (pattern === 2) {
      bookings.push({
        id,
        bookerId: userId,
        userId,
        targetKind: 'ROOM',
        roomId: 'demo-room-anneks',
        startOffset,
        endOffset,
        status: 'CONFIRMED',
      });
    } else {
      bookings.push({
        id,
        bookerId: userId,
        userId,
        targetKind: 'SLOT',
        roomId: 'demo-room-stua',
        startOffset,
        endOffset,
        status: 'CONFIRMED',
      });
    }
  }

  return bookings;
}

const CURATED_DEMO_BOOKINGS: DemoBookingSeed[] = [
  { id: 'demo-res-full', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'FULL_COTTAGE', startOffset: -132, endOffset: -129, status: 'CONFIRMED' },
  { id: 'demo-res-winter-loft', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },
  { id: 'demo-res-winter-hems', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },
  { id: 'demo-res-winter-annex', bookerId: 'demo-doc', guestName: 'The Huntsman', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },
  { id: 'demo-res-winter-stua', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: -116, endOffset: -114, status: 'CONFIRMED' },
  { id: 'demo-res-spring-full-doc', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'FULL_COTTAGE', startOffset: -94, endOffset: -91, status: 'CONFIRMED' },
  { id: 'demo-res-spring-annex', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: -72, endOffset: -70, status: 'CONFIRMED' },
  { id: 'demo-res-slot', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: -72, endOffset: -70, status: 'CONFIRMED' },
  { id: 'demo-res-friends-1', bookingId: 'demo-bk-friends', bookerId: 'demo-snow-white', guestName: 'The Huntsman', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: -48, endOffset: -46, status: 'CONFIRMED' },
  { id: 'demo-res-friends-2', bookingId: 'demo-bk-friends', bookerId: 'demo-snow-white', guestName: 'Woodland Friend', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: -48, endOffset: -46, status: 'CONFIRMED' },
  { id: 'demo-res-recent-loft', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: -28, endOffset: -26, status: 'CONFIRMED' },
  { id: 'demo-res-recent-hems', bookerId: 'demo-grumpy', guestName: 'Forest Visitor', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: -28, endOffset: -26, status: 'CONFIRMED' },
  // A denser cluster of stays right around "today" so the calendar looks lived-in.
  { id: 'demo-res-recent-anneks-sneezy', bookerId: 'demo-sneezy', userId: 'demo-sneezy', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: -10, endOffset: -8, status: 'CONFIRMED' },
  { id: 'demo-res-recent-hems1-bashful', bookerId: 'demo-bashful', userId: 'demo-bashful', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: -6, endOffset: -4, status: 'CONFIRMED' },
  { id: 'demo-res-recent-forest-happy', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'SLOT', roomId: 'demo-room-forest', startOffset: -5, endOffset: -3, status: 'CONFIRMED' },
  { id: 'demo-res-recent-stua-dopey', bookerId: 'demo-dopey', userId: 'demo-dopey', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: -3, endOffset: -1, status: 'CONFIRMED' },
  { id: 'demo-res-now-well-doc', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'SLOT', roomId: 'demo-room-well', startOffset: 0, endOffset: 1, status: 'CONFIRMED' },
  { id: 'demo-res-now-stua-happy', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: 0, endOffset: 2, status: 'CONFIRMED' },
  { id: 'demo-res-soon-mine-dopey', bookerId: 'demo-dopey', userId: 'demo-dopey', targetKind: 'SLOT', roomId: 'demo-room-mine', startOffset: 4, endOffset: 5, status: 'CONFIRMED' },
  { id: 'demo-res-soon-hems2-grumpy', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 7, endOffset: 8, status: 'CONFIRMED' },
  { id: 'demo-res-near-forest-huntsman', bookingId: 'demo-bk-near-forest', bookerId: 'demo-snow-white', guestName: 'The Huntsman', targetKind: 'SLOT', roomId: 'demo-room-forest', startOffset: 1, endOffset: 2, status: 'CONFIRMED' },
  { id: 'demo-res-near-forest-messenger', bookingId: 'demo-bk-near-forest', bookerId: 'demo-snow-white', guestName: 'Castle Messenger', targetKind: 'SLOT', roomId: 'demo-room-forest', startOffset: 1, endOffset: 2, status: 'CONFIRMED' },
  { id: 'demo-res-near-well-sleepy', bookerId: 'demo-sleepy', userId: 'demo-sleepy', targetKind: 'SLOT', roomId: 'demo-room-well', startOffset: 2, endOffset: 3, status: 'CONFIRMED' },
  { id: 'demo-res-near-mine-bashful', bookerId: 'demo-bashful', userId: 'demo-bashful', targetKind: 'SLOT', roomId: 'demo-room-mine', startOffset: 3, endOffset: 4, status: 'CONFIRMED' },
  { id: 'demo-res-loft', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'BED', bedId: 'demo-bed-loft-s', startOffset: 5, endOffset: 8, status: 'CONFIRMED' },
  { id: 'demo-res-near-chamber-sneezy', bookerId: 'demo-sneezy', userId: 'demo-sneezy', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: 6, endOffset: 7, status: 'CONFIRMED' },
  { id: 'demo-res-near-workshop-guest', bookerId: 'demo-doc', guestName: 'Woodland Friend', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: 8, endOffset: 9, status: 'CONFIRMED' },
  { id: 'demo-res-near-hearth-dopey', bookerId: 'demo-dopey', userId: 'demo-dopey', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: 9, endOffset: 11, status: 'CONFIRMED' },
  { id: 'demo-res-near-mine-guests-a', bookingId: 'demo-bk-near-mine', bookerId: 'demo-grumpy', guestName: 'Forest Visitor', targetKind: 'SLOT', roomId: 'demo-room-mine', startOffset: 10, endOffset: 12, status: 'CONFIRMED' },
  { id: 'demo-res-near-mine-guests-b', bookingId: 'demo-bk-near-mine', bookerId: 'demo-grumpy', guestName: 'Castle Messenger', targetKind: 'SLOT', roomId: 'demo-room-mine', startOffset: 10, endOffset: 12, status: 'CONFIRMED' },
  { id: 'demo-res-near-forest-dopey', bookerId: 'demo-dopey', userId: 'demo-dopey', targetKind: 'SLOT', roomId: 'demo-room-forest', startOffset: 12, endOffset: 13, status: 'CONFIRMED' },
  { id: 'demo-res-near-well-snow', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'SLOT', roomId: 'demo-room-well', startOffset: 14, endOffset: 16, status: 'CONFIRMED' },
  { id: 'demo-res-near-chamber-bashful', bookerId: 'demo-bashful', userId: 'demo-bashful', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: 17, endOffset: 18, status: 'CONFIRMED' },
  { id: 'demo-res-near-hearth-sneezy', bookerId: 'demo-sneezy', userId: 'demo-sneezy', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: 19, endOffset: 21, status: 'CONFIRMED' },
  { id: 'demo-res-near-forest-doc', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'SLOT', roomId: 'demo-room-forest', startOffset: 20, endOffset: 22, status: 'CONFIRMED' },
  { id: 'demo-res-summer-full-grumpy', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'FULL_COTTAGE', startOffset: 24, endOffset: 27, status: 'CONFIRMED' },
  { id: 'demo-res-near-bunkroom-sleepy', bookerId: 'demo-sleepy', userId: 'demo-sleepy', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 28, endOffset: 30, status: 'CONFIRMED' },
  { id: 'demo-res-near-workshop-huntsman', bookerId: 'demo-snow-white', guestName: 'The Huntsman', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: 29, endOffset: 31, status: 'CONFIRMED' },
  { id: 'demo-res-near-forest-bashful', bookerId: 'demo-bashful', userId: 'demo-bashful', targetKind: 'SLOT', roomId: 'demo-room-forest', startOffset: 31, endOffset: 33, status: 'CONFIRMED' },
  { id: 'demo-res-future-loft', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'BED', bedId: 'demo-bed-loft-d', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },
  { id: 'demo-res-future-hems', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },
  { id: 'demo-res-future-annex', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'ROOM', roomId: 'demo-room-anneks', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },
  { id: 'demo-res-future-stua', bookerId: 'demo-doc', guestName: 'Woodland Friend', targetKind: 'SLOT', roomId: 'demo-room-stua', startOffset: 42, endOffset: 44, status: 'CONFIRMED' },
  { id: 'demo-res-fam-snow-white', bookingId: 'demo-bk-fam', bookerId: 'demo-snow-white', userId: 'demo-snow-white', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },
  { id: 'demo-res-fam-grumpy', bookingId: 'demo-bk-fam', bookerId: 'demo-snow-white', userId: 'demo-grumpy', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },
  { id: 'demo-res-fam-guest', bookingId: 'demo-bk-fam', bookerId: 'demo-snow-white', guestName: 'Forest Visitor', targetKind: 'FULL_COTTAGE', startOffset: 60, endOffset: 64, status: 'CONFIRMED' },
  { id: 'demo-res-bed', bookerId: 'demo-grumpy', userId: 'demo-grumpy', targetKind: 'BED', bedId: 'demo-bed-hems-1', startOffset: 5, endOffset: 6, status: 'PENDING' },
  { id: 'demo-res-conflict-a', bookerId: 'demo-doc', userId: 'demo-doc', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 14, endOffset: 17, status: 'PENDING' },
  { id: 'demo-res-conflict-b', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'BED', bedId: 'demo-bed-hems-2', startOffset: 15, endOffset: 18, status: 'PENDING' },
  { id: 'demo-res-cancelled', bookerId: 'demo-happy', userId: 'demo-happy', targetKind: 'ROOM', roomId: 'demo-room-loft', startOffset: -4, endOffset: -2, status: 'CANCELLED' },
];

const DEMO_BOOKINGS: DemoBookingSeed[] = [
  ...generateHistoricalDemoBookings(),
  ...CURATED_DEMO_BOOKINGS,
];

function offsetRangesOverlap(a: DemoBookingSeed, b: DemoBookingSeed): boolean {
  return a.startOffset <= b.endOffset && b.startOffset <= a.endOffset;
}

function demoUserName(userId: string): string {
  const user = DEMO_USERS.find((u) => u.id === userId);
  if (!user) throw new Error(`Demo booking references unknown user ${userId}`);
  return `${user.firstName} ${user.lastName}`;
}

function demoRoomById(roomId: string): DemoRoomSeed {
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

  const byUser = new Map<string, DemoBookingSeed[]>();
  for (const booking of activeBookings) {
    if (booking.startOffset > booking.endOffset) {
      throw new Error(`Demo booking ${booking.id} ends before it starts.`);
    }
    if (booking.userId && booking.targetKind === 'ROOM') {
      if (!booking.roomId) {
        throw new Error(`Demo booking ${booking.id} is missing a room id.`);
      }
      const room = demoRoomById(booking.roomId);
      if (room.capacityMode === 'BEDS' && (room.beds?.length ?? 0) > 1) {
        throw new Error(
          `Demo booking ${booking.id} puts ${demoUserName(booking.userId)} in a whole multi-bed room. Use a BED target instead.`,
        );
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

const DEMO_DUGNAD = [
  {
    id: 'demo-dugnad-gem-ledger',
    title: 'Tally the gemstones',
    description:
      'Count the diamonds and rubies brought up from the mine, record them in the ledger, and lock the strongbox before supper.',
    createdBy: 'demo-doc',
    completedBy: 'demo-doc',
    completedDaysAgo: 2,
  },
  {
    id: 'demo-dugnad-pickaxe-sharpen',
    title: 'Sharpen the seven pickaxes',
    description:
      'Put a fresh edge on every pickaxe at the grindstone so no one swings a blunt one down in the mine.',
    createdBy: 'demo-grumpy',
    completedBy: 'demo-sleepy',
    completedDaysAgo: 3,
  },
  {
    id: 'demo-dugnad-sweep-cottage',
    title: 'Sweep the cottage floor',
    description:
      'Sweep the dust and stray gem-chips from the floor and shake out the little rug by the hearth.',
    createdBy: 'demo-grumpy',
    completedBy: 'demo-happy',
    completedDaysAgo: 4,
  },
  {
    id: 'demo-dugnad-make-beds',
    title: 'Make the seven little beds',
    description:
      'Smooth the quilts on all seven beds and plump the pillows so each bed is ready before nightfall.',
    createdBy: 'demo-bashful',
    completedBy: 'demo-dopey',
    completedDaysAgo: 5,
  },
  {
    id: 'demo-dugnad-wash-dishes',
    title: 'Wash the plates and cups',
    description:
      'Scrub the seven little plates, cups, and spoons after supper and stand them to dry on the dresser.',
    createdBy: 'demo-snow-white',
    completedBy: 'demo-snow-white',
    completedDaysAgo: 6,
  },
  {
    id: 'demo-dugnad-wind-clock',
    title: 'Wind the cuckoo clock',
    description:
      'Wind the carved cuckoo clock on the mantel and dust the little bird and its perch.',
    createdBy: 'demo-doc',
    completedBy: 'demo-happy',
    completedDaysAgo: 7,
  },
  {
    id: 'demo-dugnad-air-bedding',
    title: 'Air out the bedding',
    description:
      'Hang the quilts and blankets on the line between the trees and beat the dust from them in the sun.',
    createdBy: 'demo-sneezy',
    completedBy: 'demo-sneezy',
    completedDaysAgo: 8,
  },
  {
    id: 'demo-dugnad-lay-fire',
    title: 'Lay the hearth fire',
    description:
      'Clear the ash from the great stone hearth and stack fresh kindling so the fire is ready to light at dusk.',
    createdBy: 'demo-sleepy',
    completedBy: 'demo-bashful',
    completedDaysAgo: 9,
  },
  {
    id: 'demo-dugnad-trim-lanterns',
    title: 'Trim the mine lanterns',
    description:
      'Trim the wicks and top up the oil in all seven mine lanterns so they burn bright in the tunnels.',
    createdBy: 'demo-doc',
    completedBy: 'demo-doc',
    completedDaysAgo: 10,
  },
  {
    id: 'demo-dugnad-fill-water',
    title: 'Fill the water bucket',
    description:
      'Draw fresh water from the wishing well and fill the kitchen bucket and the kettle.',
    createdBy: 'demo-dopey',
    completedBy: 'demo-dopey',
    completedDaysAgo: 11,
  },
  {
    id: 'demo-dugnad-stack-firewood',
    title: 'Stack the firewood',
    description:
      'Split and stack the firewood under the eaves by the door, and keep the driest logs nearest the hearth.',
    createdBy: 'demo-grumpy',
    completedBy: 'demo-grumpy',
    completedDaysAgo: 12,
  },
  {
    id: 'demo-dugnad-rake-path',
    title: 'Rake the path to the mine',
    description:
      'Rake the leaves and twigs from the forest path and roll any loose stones out of the way.',
    createdBy: 'demo-happy',
    completedBy: 'demo-happy',
    completedDaysAgo: 13,
  },
  {
    id: 'demo-dugnad-scrub-cauldron',
    title: 'Scrub the cooking cauldron',
    description:
      'Scrub the big cauldron clean and hang the ladle and pots back on their hooks above the hearth.',
    createdBy: 'demo-snow-white',
    completedBy: 'demo-doc',
    completedDaysAgo: 14,
  },
  {
    id: 'demo-dugnad-fresh-candles',
    title: 'Set out fresh candles',
    description:
      'Replace the burnt stubs in the candlesticks on the table and along the windowsills; spares are in the dresser drawer.',
    createdBy: 'demo-bashful',
    completedBy: 'demo-sleepy',
    completedDaysAgo: 15,
  },
  {
    id: 'demo-dugnad-polish-gems',
    title: 'Polish the gems for market',
    description:
      'Buff the cut diamonds and rubies until they sparkle and sort them into the little velvet pouches.',
    createdBy: 'demo-happy',
    completedBy: 'demo-bashful',
    completedDaysAgo: 16,
  },
  {
    id: 'demo-dugnad-sweep-step',
    title: 'Sweep the front step',
    description:
      'Sweep the leaves from the front step and shake out the doormat so no mud is tracked indoors.',
    createdBy: 'demo-sneezy',
    completedBy: 'demo-sneezy',
    completedDaysAgo: 17,
  },
  {
    id: 'demo-dugnad-oil-carts',
    title: 'Oil the mine carts',
    description:
      'Grease the wheels and axles of the mine carts so they roll quiet and do not squeal in the tunnels.',
    createdBy: 'demo-grumpy',
    completedBy: 'demo-grumpy',
    completedDaysAgo: 18,
  },
  {
    id: 'demo-dugnad-clear-gutter',
    title: 'Clear the roof gutter',
    description:
      'Clear the fallen leaves from the gutter above the porch; use the ladder only when someone else is nearby.',
    createdBy: 'demo-doc',
    completedBy: 'demo-doc',
    completedDaysAgo: 19,
  },
  {
    id: 'demo-dugnad-stock-pantry',
    title: 'Stock the pantry shelves',
    description:
      'Tidy the pantry and label the crocks of flour, sugar, honey, and dried forest berries.',
    createdBy: 'demo-snow-white',
    completedBy: 'demo-snow-white',
    completedDaysAgo: 20,
  },
  {
    id: 'demo-dugnad-herb-cupboard',
    title: 'Restock the herb cupboard',
    description:
      'Check the salves, bandages, and dried herbs, and note down whatever must be gathered from the forest.',
    createdBy: 'demo-doc',
    completedBy: 'demo-happy',
    completedDaysAgo: 21,
  },
  {
    id: 'demo-dugnad-mend-quilts',
    title: 'Mend the patchwork quilts',
    description:
      'Sew up the torn patches on the quilts and fold them back at the foot of each bed.',
    createdBy: 'demo-sleepy',
    completedBy: 'demo-dopey',
    completedDaysAgo: 22,
  },
  {
    id: 'demo-dugnad-door-bolt',
    title: 'Mend the door bolt',
    description:
      'The cottage door bolt sticks. Plane the edge and oil the hinge so it locks fast against unwelcome callers.',
    createdBy: 'demo-grumpy',
  },
  {
    id: 'demo-dugnad-paint-shutters',
    title: 'Touch up the window shutters',
    description:
      'Sand the chips and dab fresh paint on the carved shutters once the weather turns dry.',
    createdBy: 'demo-bashful',
  },
  {
    id: 'demo-dugnad-empty-scraps',
    title: 'Empty the scrap pail',
    description:
      'Carry the kitchen scraps out to the heap behind the garden, rinse the pail, and set it back by the door.',
    createdBy: 'demo-dopey',
  },
  {
    id: 'demo-dugnad-wash-curtains',
    title: 'Wash the loft curtains',
    description:
      'Take down the little curtains in the sleeping loft and wash them on a gentle cycle.',
    createdBy: 'demo-sleepy',
  },
  {
    id: 'demo-dugnad-oil-bench',
    title: 'Oil the garden bench',
    description:
      'Brush off the bench under the apple tree and rub a thin coat of oil into the seat and back.',
    createdBy: 'demo-happy',
  },
  {
    id: 'demo-dugnad-cellar-traps',
    title: 'Check the cellar mousetraps',
    description:
      'Go over the traps in the cellar and under the kitchen bench. Wear gloves.',
    createdBy: 'demo-sneezy',
  },
  {
    id: 'demo-dugnad-feed-birds',
    title: 'Scatter seed for the birds',
    description:
      'Scatter seed and breadcrumbs on the sill and the garden stump for the forest birds each morning.',
    createdBy: 'demo-snow-white',
  },
  {
    id: 'demo-dugnad-guest-book',
    title: 'Set out a new guest book',
    description:
      'The old guest book is full. Set out the new one by the door and move the old one to the shelf.',
    createdBy: 'demo-doc',
  },
  {
    id: 'demo-dugnad-wash-windows',
    title: 'Wash the cottage windows',
    description:
      'Wash the big parlour windows until they shine, so the dwarves can spot the lantern light on their way home.',
    createdBy: 'demo-happy',
  },
] as const;

const DEMO_GROUPS = [
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
  {
    id: 'demo-group-venner',
    name: 'Mine Crew',
    createdBy: 'demo-doc',
    members: [
      {
        id: 'demo-gm-crew-doc',
        userId: 'demo-doc',
        preferredRoomId: 'demo-room-loft',
        preferredBedId: 'demo-bed-loft-s',
      },
      { id: 'demo-gm-crew-happy', userId: 'demo-happy', preferredRoomId: 'demo-room-stua' },
      { id: 'demo-gm-crew-guest', guestName: 'Woodland Friend' },
    ],
  },
] as const;

const DEMO_INVITES = [
  {
    id: 'demo-inv-link',
    token: 'demo-invite-open-link',
    maxUses: 10,
    useCount: 3,
    expiresInDays: 30,
  },
  {
    id: 'demo-inv-huntsman',
    token: 'demo-invite-huntsman',
    email: 'huntsman@example.com',
    maxUses: 1,
    useCount: 0,
    expiresInDays: 14,
  },
  {
    id: 'demo-inv-forest-friend',
    token: 'demo-invite-forest-friend',
    email: 'forest.friend@example.com',
    maxUses: 1,
    useCount: 0,
    expiresInDays: 14,
  },
  {
    id: 'demo-inv-expired',
    token: 'demo-invite-expired',
    email: 'old.invite@example.com',
    maxUses: 1,
    useCount: 0,
    expiresInDays: -3,
  },
  {
    id: 'demo-inv-revoked',
    token: 'demo-invite-revoked',
    maxUses: 5,
    useCount: 1,
    expiresInDays: 30,
    revokedDaysAgo: 1,
  },
] as const;

export function createDemoState(nowMs = Date.now()): DemoState {
  assertDemoBookingsAreConsistent();
  const nowSec = Math.floor(nowMs / 1000);
  // Password hashes are precomputed (see demo-password-hashes.ts) rather than
  // hashed here: this seed is rebuilt in-isolate on every demo request, and
  // PBKDF2'ing each account at runtime blew the Workers Free-plan 10ms CPU cap.

  return {
    users: DEMO_USERS.map((u) => ({
      id: u.id,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`,
      firstName: u.firstName,
      lastName: u.lastName,
      emailVerified: nowMs,
      image: null,
      passwordHash: demoPasswordHashFor(u.email),
      isAdmin: u.isAdmin ?? false,
      isManager: u.isManager ?? false,
      isInvitee: true,
      notifyEnabled: true,
      notifyBooking: true,
      notifyRequests: true,
      firstLoginCompletedAt: nowSec,
      calendarToken: null,
      createdAt: nowSec,
    })),
    accounts: [],
    sessions: [],
    verificationTokens: [],
    passwordResetTokens: [],
    cottageSettings: [
      {
        id: 'singleton',
        name: DEMO_COTTAGE_NAME,
        description: null,
        createdAt: nowSec,
        updatedAt: nowSec,
      },
    ],
    rooms: DEMO_ROOMS.map((room) => ({
      id: room.id,
      nameNb: room.nameNb,
      nameEn: room.nameEn,
      icon: room.icon,
      color: room.color,
      capacityMode: room.capacityMode,
      slotCount: room.slotCount ?? null,
      createdAt: nowSec,
    })),
    beds: DEMO_ROOMS.flatMap((room) =>
      (room.beds ?? []).map((bed) => ({
        id: bed.id,
        roomId: room.id,
        kind: bed.kind,
        label: bed.label,
        createdAt: nowSec,
      })),
    ),
    groupTemplates: DEMO_GROUPS.map((group) => ({
      id: group.id,
      name: group.name,
      createdBy: group.createdBy,
      createdAt: nowSec,
    })),
    groupMembers: DEMO_GROUPS.flatMap((group) =>
      group.members.map((member, position) => ({
        id: member.id,
        groupId: group.id,
        userId: 'userId' in member ? member.userId : null,
        guestName: 'guestName' in member ? member.guestName : null,
        preferredRoomId: 'preferredRoomId' in member ? member.preferredRoomId : null,
        preferredBedId: 'preferredBedId' in member ? member.preferredBedId : null,
        position,
        createdAt: nowSec,
      })),
    ),
    dugnadTasks: DEMO_DUGNAD.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      createdBy: task.createdBy,
      createdAt: nowSec,
      completedBy: 'completedBy' in task ? task.completedBy : null,
      completedAt:
        'completedBy' in task
          ? nowSec - (task.completedDaysAgo ?? 1) * 24 * 60 * 60
          : null,
    })),
    reservations: DEMO_BOOKINGS.map((booking) => ({
      id: booking.id,
      bookingId: booking.bookingId ?? booking.id,
      bookerId: booking.bookerId,
      userId: booking.userId ?? null,
      guestName: booking.guestName ?? null,
      targetKind: booking.targetKind,
      roomId: booking.roomId ?? null,
      bedId: booking.bedId ?? null,
      startDate: iso(nowMs, booking.startOffset),
      endDate: iso(nowMs, booking.endOffset),
      status: booking.status,
      createdAt: nowSec,
    })),
    invitations: DEMO_INVITES.map((invite) => ({
      id: invite.id,
      token: invite.token,
      createdBy: 'demo-snow-white',
      maxUses: invite.maxUses ?? null,
      useCount: invite.useCount ?? 0,
      email: 'email' in invite ? invite.email : null,
      expiresAt: nowMs + invite.expiresInDays * DAY_MS,
      revokedAt:
        'revokedDaysAgo' in invite && invite.revokedDaysAgo != null
          ? nowMs - invite.revokedDaysAgo * DAY_MS
          : null,
      createdAt: nowSec,
    })),
  };
}
