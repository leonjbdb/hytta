import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

/* ----------------------------------------------------------------------- *
 * Domain enums (encoded as TEXT + CHECK constraints, since SQLite has no
 * enum type).
 * ----------------------------------------------------------------------- */
export const BED_KINDS = ['DOUBLE', 'SINGLE'] as const;
export const TARGET_KINDS = ['FULL_COTTAGE', 'ROOM', 'BED', 'SLOT'] as const;
export const ROOM_CAPACITY_MODES = ['BEDS', 'SLOTS'] as const;
export const RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const;

export type BedKind = (typeof BED_KINDS)[number];
export type TargetKind = (typeof TARGET_KINDS)[number];
export type RoomCapacityMode = (typeof ROOM_CAPACITY_MODES)[number];
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Slot capacity of a single bed: doubles fit two people, singles one. */
export const BED_CAPACITY: Record<BedKind, number> = { DOUBLE: 2, SINGLE: 1 };

const cuid = () => randomUUID();
const now = () => Math.floor(Date.now() / 1000);

/* ----------------------------------------------------------------------- *
 * Auth.js v5 — Drizzle SQLite adapter shape.
 * Field names follow the @auth/drizzle-adapter "default" SQLite layout.
 * ----------------------------------------------------------------------- */
export const users = sqliteTable('user', {
  id: text('id').primaryKey().$defaultFn(cuid),
  /**
   * Display name. Nullable at the SQLite layer because Auth.js's drizzle
   * adapter occasionally inserts rows before the user picks one (legacy
   * shape). Application code (signup, settings, invite-accept) enforces
   * `min(1)` at the zod boundary so live accounts always have one.
   */
  name: text('name'),
  /**
   * Structured name parts. `firstName` holds the given name(s) ("Ola Bjørn"),
   * `lastName` the family name ("Nordmann"). `name` above stays the
   * canonical full display name (`firstName + ' ' + lastName`), recomputed
   * whenever the parts are saved, so every existing read site keeps working.
   * The header derives a short label: first given name + last name.
   */
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email').unique().notNull(),
  emailVerified: integer('email_verified', { mode: 'timestamp_ms' }),
  image: text('image'),
  /**
   * argon2id hash of the user's password. NULL for accounts that only ever
   * sign in via magic link. Set when the user picks a password via Settings
   * or completes a password-reset flow.
   */
  passwordHash: text('password_hash'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  /**
   * Booking manager. When at least one user has this flag, every new booking
   * is created as PENDING and only a manager can move it to CONFIRMED.
   * When no manager exists the system auto-confirms (legacy behaviour).
   */
  isManager: integer('is_manager', { mode: 'boolean' }).notNull().default(false),
  /**
   * Inviter. Every account is granted this flag on creation; admins can
   * revoke it to stop a user from minting new invitation URLs.
   */
  isInvitee: integer('is_invitee', { mode: 'boolean' }).notNull().default(false),
  /**
   * Email notification preferences. `notifyEnabled` is the master switch; the
   * two sub-flags only take effect while it is on. `notifyBooking` (everyone)
   * covers approve/reject/delete of bookings the user created; `notifyRequests`
   * (managers only) fires when someone requests a booking. Promotion/demotion
   * to/from admin or manager is gated on `notifyEnabled` alone. The sub-flags
   * default on so flipping the master switch immediately does the useful thing.
   */
  notifyEnabled: integer('notify_enabled', { mode: 'boolean' }).notNull().default(false),
  notifyBooking: integer('notify_booking', { mode: 'boolean' }).notNull().default(true),
  notifyRequests: integer('notify_requests', { mode: 'boolean' }).notNull().default(true),
  /**
   * Opaque token embedded in personal iCal feed URLs so calendar apps can
   * subscribe without an interactive sign-in. Generated lazily; rotating it
   * invalidates anyone subscribed.
   */
  calendarToken: text('calendar_token').unique(),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

/**
 * Shareable invite tokens. Each row owns a single random token (the URL
 * fragment). `maxUses` null = unlimited (multi-use); 1 = single-use. The
 * caller mints with an `expiresAt` 1 h–168 h in the future and can revoke
 * by setting `revokedAt`.
 */
export const invitations = sqliteTable(
  'invitation',
  {
    id: text('id').primaryKey().$defaultFn(cuid),
    token: text('token').notNull().unique(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null = unlimited multi-use. Otherwise the cap (typically 1). */
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    /**
     * Optional pre-bound email. When set, the invite was emailed directly to
     * a specific address: the accept page hides the email field and the
     * server records the new account against this address (recipient cannot
     * substitute their own). Null = shareable link the recipient fills in.
     */
    email: text('email'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('invitation_created_by_idx').on(t.createdBy),
    check('invitation_max_uses_positive', sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`),
    check('invitation_use_count_nonneg', sql`${t.useCount} >= 0`),
  ],
);

export const accounts = sqliteTable(
  'account',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index('account_user_id_idx').on(t.userId),
  ],
);

export const sessions = sqliteTable('session', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * Password-reset tokens. Stored as SHA-256 hash (not raw) so a DB read does
 * not grant the attacker password-write capability for the residual TTL —
 * stricter than the invitation table because reset grants write access.
 */
export const passwordResetTokens = sqliteTable(
  'password_reset_token',
  {
    id: text('id').primaryKey().$defaultFn(cuid),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('password_reset_token_user_idx').on(t.userId)],
);

/* ----------------------------------------------------------------------- *
 * Instance settings — a single row holding cottage-wide configuration the
 * operator sets on first run. Currently just the cottage's display name
 * (the app itself is "Hytta"; each deployment names its own cottage, e.g.
 * "Granli"). Enforced as a singleton via a fixed primary key.
 * ----------------------------------------------------------------------- */
export const cottageSettings = sqliteTable(
  'cottage_settings',
  {
    /** Always the literal 'singleton' — guarantees at most one row. */
    id: text('id').primaryKey().default('singleton'),
    /** Operator-chosen cottage display name (e.g. "Granli"). */
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (t) => [
    check('cottage_settings_singleton', sql`${t.id} = 'singleton'`),
    check('cottage_settings_name_nonempty', sql`length(trim(${t.name})) > 0`),
  ],
);

/* ----------------------------------------------------------------------- *
 * Cottage domain
 * ----------------------------------------------------------------------- */
export const rooms = sqliteTable(
  'room',
  {
    id: text('id').primaryKey().$defaultFn(cuid),
    /** Norwegian display name. Acts as the canonical name + uniqueness key. */
    nameNb: text('name_nb').notNull().unique(),
    /** English display name. Required so every room renders correctly under
     *  either locale. */
    nameEn: text('name_en').notNull(),
    /** Lucide icon name — see src/components/booking/RoomIcon.tsx for the catalog. */
    icon: text('icon').notNull(),
    /** CSS colour applied as a tint to the room's icon and indicators. */
    color: text('color').notNull().default('#64748b'),
    /**
     * `BEDS`: room has child rows in `bed`; bookable per-bed or whole-room;
     * total capacity = sum(bed capacity).
     * `SLOTS`: room has no beds; bookable per-slot. `slotCount` caps the
     *  number of concurrent SLOT bookings (NULL = unlimited).
     */
    capacityMode: text('capacity_mode').notNull().default('BEDS').$type<RoomCapacityMode>(),
    /** Only meaningful when `capacityMode = 'SLOTS'`. NULL = unlimited. */
    slotCount: integer('slot_count'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    check('room_capacity_mode_valid', sql`${t.capacityMode} IN ('BEDS','SLOTS')`),
    check(
      'room_slot_count_shape',
      sql`(${t.capacityMode} = 'BEDS' AND ${t.slotCount} IS NULL)
        OR (${t.capacityMode} = 'SLOTS' AND (${t.slotCount} IS NULL OR ${t.slotCount} > 0))`,
    ),
  ],
);

export const beds = sqliteTable(
  'bed',
  {
    id: text('id').primaryKey().$defaultFn(cuid),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<BedKind>(),
    label: text('label').notNull().unique(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    check('bed_kind_valid', sql`${t.kind} IN ('DOUBLE','SINGLE')`),
    index('bed_room_id_idx').on(t.roomId),
  ],
);

/* ----------------------------------------------------------------------- *
 * Group templates — reusable presets that pre-fill a booking with N people
 * mapped to specific rooms. Whole-cottage trips don't need a template; the
 * booking page already lets you add as many participants as you want when
 * you pick "Whole cottage".
 *
 * Any registered member of a group can edit it (no separate "owner" concept).
 * Table name `group_template` because `group` is a reserved word in SQL.
 * ----------------------------------------------------------------------- */
export const groupTemplates = sqliteTable('group_template', {
  id: text('id').primaryKey().$defaultFn(cuid),
  name: text('name').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export const groupMembers = sqliteTable(
  'group_member',
  {
    id: text('id').primaryKey().$defaultFn(cuid),
    groupId: text('group_id')
      .notNull()
      .references(() => groupTemplates.id, { onDelete: 'cascade' }),
    /** Either a registered user OR a guest name — exactly one is set. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    guestName: text('guest_name'),
    /** The room this member normally sleeps in. Nullable so members can be
     *  added before their room is decided; the booking pre-fill skips them. */
    preferredRoomId: text('preferred_room_id').references(() => rooms.id, {
      onDelete: 'set null',
    }),
    /** Optional preferred bed within `preferredRoomId` (only meaningful for
     *  BEDS-mode rooms). Cleared whenever the preferred room changes. */
    preferredBedId: text('preferred_bed_id').references(() => beds.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    check(
      'group_member_participant_shape',
      sql`(${t.userId} IS NOT NULL AND ${t.guestName} IS NULL)
        OR (${t.userId} IS NULL AND ${t.guestName} IS NOT NULL)`,
    ),
    index('group_member_group_idx').on(t.groupId),
    index('group_member_user_idx').on(t.userId),
  ],
);

/* ----------------------------------------------------------------------- *
 * Dugnad — collaborative maintenance tasks for the cottage. Anyone signed
 * in can post a task or mark one as solved; ownership is tracked for both
 * roles. While a task is open the creator (or admin) can edit it; once
 * `completedAt` is set the row is immutable. Delete is restricted to the
 * creator or an admin in any state.
 * ----------------------------------------------------------------------- */
export const dugnadTasks = sqliteTable(
  'dugnad_task',
  {
    id: text('id').primaryKey().$defaultFn(cuid),
    title: text('title').notNull(),
    description: text('description').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    completedBy: text('completed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: integer('completed_at'),
  },
  (t) => [
    /*
     * A completer implies a completion time, but not vice versa: when the
     * completer's account is deleted the `completed_by` FK nulls itself
     * (ON DELETE SET NULL) while `completed_at` stays, leaving the task
     * "done, by an unknown user". Read sites left-join the completer and
     * treat its fields as nullable, so that state renders fine. The only
     * shape forbidden is a completer set without a timestamp.
     */
    check(
      'dugnad_completed_shape',
      sql`${t.completedBy} IS NULL OR ${t.completedAt} IS NOT NULL`,
    ),
    check('dugnad_title_nonempty', sql`length(trim(${t.title})) > 0`),
    check('dugnad_description_nonempty', sql`length(trim(${t.description})) > 0`),
    index('dugnad_completed_at_idx').on(t.completedAt),
    index('dugnad_created_by_idx').on(t.createdBy),
  ],
);

export const reservations = sqliteTable(
  'reservation',
  {
    id: text('id').primaryKey().$defaultFn(cuid),
    /**
     * Groups rows that belong to the same shared booking. Multi-room/multi-bed
     * bookings share a single bookingId; single-target bookings have a row
     * whose bookingId equals the row id by convention.
     */
    bookingId: text('booking_id'),
    /**
     * The user who created the booking. Distinct from userId, which refers to
     * the **participant** assigned to this row. Booker may cancel any row in
     * their booking; participants may cancel their own row.
     */
    bookerId: text('booker_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Registered participant. NULL when the participant is a guest who has
     * no account; in that case `guestName` is set instead.
     */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Free-form guest name. Mutually exclusive with `userId`. */
    guestName: text('guest_name'),
    targetKind: text('target_kind').notNull().$type<TargetKind>(),
    roomId: text('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
    bedId: text('bed_id').references(() => beds.id, { onDelete: 'cascade' }),
    /**
     * Closed range [start_date, end_date]. ISO `YYYY-MM-DD`. Both endpoints
     * are inclusive — booking 2026-05-19 to 2026-05-19 reserves a single day,
     * 2026-05-19 to 2026-05-20 reserves two days. Lex compare on ISO 8601
     * dates is correct.
     */
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: text('status')
      .notNull()
      .default('PENDING')
      .$type<ReservationStatus>(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    check(
      'reservation_target_shape',
      sql`(${t.targetKind} = 'FULL_COTTAGE' AND ${t.roomId} IS NULL AND ${t.bedId} IS NULL)
        OR (${t.targetKind} = 'ROOM'         AND ${t.roomId} IS NOT NULL AND ${t.bedId} IS NULL)
        OR (${t.targetKind} = 'BED'          AND ${t.bedId}  IS NOT NULL AND ${t.roomId} IS NULL)
        OR (${t.targetKind} = 'SLOT'         AND ${t.roomId} IS NOT NULL AND ${t.bedId} IS NULL)`,
    ),
    check(
      'reservation_target_kind_valid',
      sql`${t.targetKind} IN ('FULL_COTTAGE','ROOM','BED','SLOT')`,
    ),
    check(
      'reservation_participant_shape',
      sql`(${t.userId} IS NOT NULL AND ${t.guestName} IS NULL)
        OR (${t.userId} IS NULL AND ${t.guestName} IS NOT NULL)`,
    ),
    check(
      'reservation_status_valid',
      sql`${t.status} IN ('PENDING','CONFIRMED','CANCELLED')`,
    ),
    check(
      'reservation_iso_dates',
      sql`${t.startDate} GLOB '????-??-??' AND ${t.endDate} GLOB '????-??-??'`,
    ),
    check('reservation_dates_ordered', sql`${t.startDate} <= ${t.endDate}`),
    index('reservation_dates_idx').on(t.startDate, t.endDate),
    index('reservation_user_idx').on(t.userId),
    index('reservation_status_target_idx').on(t.status, t.targetKind),
    index('reservation_booking_idx').on(t.bookingId),
    uniqueIndex('reservation_id_idx').on(t.id),
  ],
);
