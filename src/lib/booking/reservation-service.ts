import { and, desc, eq, gte, inArray, lte, ne, or } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { randomUUID } from 'node:crypto';
import type { DB } from '@/db/drizzle';
import { BED_CAPACITY, reservations, rooms, beds, users } from '@/db/schema';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './errors';
import { createConflictChecker } from './conflicts';
import { detectRequestConflicts, type ConflictInput } from './request-conflicts';
import {
  parseCreateBooking,
  parseCreateReservation,
  type CreateBookingInput,
  type ParticipantInput,
} from './validators';
import type { Reservation, TargetSpec } from './types';

/**
 * ReservationService owns the conflict-check-then-insert critical section.
 *
 * On D1 there are no interactive transactions, so the original
 * `BEGIN IMMEDIATE` write lock is gone. Atomicity of a multi-row write is
 * provided by `db.batch()` (all-or-nothing). The *serialization* that prevents
 * two overlapping bookings racing past each other's conflict check is provided
 * by running every mutating call inside the BookingDO Durable Object, which is
 * the single writer for reservations (see `src/server/booking/booking-do.ts`).
 * Read-only methods may run anywhere with a request-scoped client.
 */
export class ReservationService {
  private readonly db: DB;
  private readonly conflicts: ReturnType<typeof createConflictChecker>;

  constructor(db: DB) {
    this.db = db;
    this.conflicts = createConflictChecker(db);
  }

  /** Run a set of statements atomically (no-op when empty). */
  private async runBatch(stmts: BatchItem<'sqlite'>[]): Promise<void> {
    if (stmts.length === 0) return;
    await this.db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  }

  /**
   * Single-target wrapper preserved for backward compatibility with tests and
   * any caller that has not migrated to multi-participant bookings yet. New
   * code should use `createBooking` instead.
   */
  async create(userId: string, raw: unknown): Promise<Reservation> {
    const input = parseCreateReservation(raw);
    const participant: ParticipantInput =
      input.kind === 'FULL_COTTAGE'
        ? { targetKind: 'FULL_COTTAGE', userId }
        : input.kind === 'ROOM'
          ? { targetKind: 'ROOM', roomId: input.roomId, userId }
          : input.kind === 'BED'
            ? { targetKind: 'BED', bedId: input.bedId, userId }
            : { targetKind: 'SLOT', roomId: input.roomId, userId };

    const { rows } = await this.createBooking(userId, {
      startDate: input.startDate,
      endDate: input.endDate,
      participants: [participant],
    });
    const row = rows[0];
    if (!row) throw new Error('Insert returned no rows');
    return row;
  }

  /** Total slot capacity for a room (sum of bed slots, or `slot_count`). */
  private async roomCapacity(roomId: string): Promise<number | null> {
    const room = (
      await this.db.select().from(rooms).where(eq(rooms.id, roomId)).all()
    )[0];
    if (!room) return 0;
    if (room.capacityMode === 'SLOTS') return room.slotCount;
    const bedRows = await this.db
      .select({ kind: beds.kind })
      .from(beds)
      .where(eq(beds.roomId, roomId))
      .all();
    return bedRows.reduce((acc, b) => acc + (b.kind === 'DOUBLE' ? 2 : 1), 0);
  }

  async createBooking(
    bookerId: string,
    raw: unknown,
  ): Promise<{ bookingId: string; rows: Reservation[] }> {
    const input = parseCreateBooking(raw);

    const roomIds = input.participants
      .filter((p): p is Extract<ParticipantInput, { targetKind: 'ROOM' | 'SLOT' }> =>
        p.targetKind === 'ROOM' || p.targetKind === 'SLOT',
      )
      .map((p) => p.roomId);
    const bedIds = input.participants
      .filter((p): p is Extract<ParticipantInput, { targetKind: 'BED' }> => p.targetKind === 'BED')
      .map((p) => p.bedId);
    const participantUserIds = [
      ...new Set(
        input.participants
          .map((p) => p.userId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];

    if (roomIds.length > 0) {
      const found = await this.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(inArray(rooms.id, roomIds))
        .all();
      if (found.length !== new Set(roomIds).size) throw new NotFoundError('Room');
    }
    if (bedIds.length > 0) {
      const found = await this.db
        .select({ id: beds.id })
        .from(beds)
        .where(inArray(beds.id, bedIds))
        .all();
      if (found.length !== new Set(bedIds).size) throw new NotFoundError('Bed');
    }
    if (participantUserIds.length > 0) {
      const foundUsers = await this.db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, participantUserIds))
        .all();
      if (foundUsers.length !== participantUserIds.length) {
        throw new ValidationError([
          { path: 'participants', message: 'Unknown participant user' },
        ]);
      }
    }

    const bookingId = randomUUID();
    const range = { startDate: input.startDate, endDate: input.endDate };

    // A registered participant can't be in two places at once. Guests are
    // free-form names so we don't try to dedupe them across bookings.
    if (participantUserIds.length > 0) {
      const userBusy = await this.db
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            inArray(reservations.userId, participantUserIds),
            // Only a CONFIRMED stay blocks — a participant may sit in several
            // PENDING requests at once (a manager picks which to approve).
            eq(reservations.status, 'CONFIRMED'),
            lte(reservations.startDate, input.endDate),
            gte(reservations.endDate, input.startDate),
          ),
        )
        .all();
      if (userBusy.length > 0) {
        throw new ConflictError(
          'One or more participants already have a reservation overlapping these dates',
        );
      }
    }

    // If any user has the manager role, new bookings start as PENDING and a
    // manager has to approve them. With no manager, the original instant
    // confirm behaviour applies. Managers booking for themselves skip the
    // queue — their own booking is auto-confirmed.
    const managers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isManager, true))
      .all();
    const managerExists = managers.length > 0;
    const bookerIsManager = managers.some((m) => m.id === bookerId);
    const initialStatus =
      !managerExists || bookerIsManager ? ('CONFIRMED' as const) : ('PENDING' as const);

    const inserts: BatchItem<'sqlite'>[] = [];
    for (const p of input.participants) {
      const spec: TargetSpec =
        p.targetKind === 'FULL_COTTAGE'
          ? { kind: 'FULL_COTTAGE' }
          : p.targetKind === 'ROOM'
            ? { kind: 'ROOM', roomId: p.roomId }
            : p.targetKind === 'BED'
              ? { kind: 'BED', bedId: p.bedId }
              : { kind: 'SLOT', roomId: p.roomId };

      // Siblings in this booking are not in conflict with each other.
      if (await this.conflicts.check(spec, range, { excludeBookingId: bookingId })) {
        throw new ConflictError();
      }

      inserts.push(
        this.db.insert(reservations).values({
          bookingId,
          bookerId,
          userId: p.userId ?? null,
          guestName: p.userId ? null : p.guestName ?? null,
          targetKind: p.targetKind,
          roomId: spec.kind === 'ROOM' || spec.kind === 'SLOT' ? spec.roomId : null,
          bedId: spec.kind === 'BED' ? spec.bedId : null,
          startDate: input.startDate,
          endDate: input.endDate,
          status: initialStatus,
        }),
      );
    }

    await this.runBatch(inserts);

    const rows = (await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all()) as Reservation[];
    return { bookingId, rows };
  }

  /**
   * Replace an existing booking's layout in place — same `bookingId`, same
   * original booker — with a new set of participants/targets and dates. Used by
   * the edit flow. Only the booking's owner may edit it, unless `allowAnyBooker`
   * (admins). Re-runs conflict + participant-busy checks against everything
   * except this booking's own rows.
   */
  async updateBooking(
    actorId: string,
    bookingId: string,
    raw: unknown,
    opts?: { allowAnyBooker?: boolean },
  ): Promise<{ bookingId: string; rows: Reservation[] }> {
    const input = parseCreateBooking(raw);

    const existing = await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all();
    const active = existing.filter(
      (r) => r.status === 'CONFIRMED' || r.status === 'PENDING',
    );
    if (active.length === 0) throw new NotFoundError('Booking');
    const ownerId = active[0]!.bookerId;
    if (ownerId !== actorId && !opts?.allowAnyBooker) throw new ForbiddenError();

    const participantUserIds = [
      ...new Set(
        input.participants
          .map((p) => p.userId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const range = { startDate: input.startDate, endDate: input.endDate };

    if (participantUserIds.length > 0) {
      const userBusy = await this.db
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            inArray(reservations.userId, participantUserIds),
            // Only a CONFIRMED stay blocks — a participant may sit in several
            // PENDING requests at once (a manager picks which to approve).
            eq(reservations.status, 'CONFIRMED'),
            // Exclude this booking's own rows: they're about to be replaced, so
            // they must not count as the participant being "busy".
            ne(reservations.bookingId, bookingId),
            lte(reservations.startDate, input.endDate),
            gte(reservations.endDate, input.startDate),
          ),
        )
        .all();
      if (userBusy.length > 0) {
        throw new ConflictError(
          'One or more participants already have a reservation overlapping these dates',
        );
      }
    }

    const managers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isManager, true))
      .all();
    const managerExists = managers.length > 0;
    const ownerIsManager = managers.some((m) => m.id === ownerId);
    const initialStatus =
      !managerExists || ownerIsManager ? ('CONFIRMED' as const) : ('PENDING' as const);

    // Drop the booking's current rows and insert the new layout atomically.
    const stmts: BatchItem<'sqlite'>[] = [
      this.db.delete(reservations).where(eq(reservations.bookingId, bookingId)),
    ];
    for (const p of input.participants) {
      const spec: TargetSpec =
        p.targetKind === 'FULL_COTTAGE'
          ? { kind: 'FULL_COTTAGE' }
          : p.targetKind === 'ROOM'
            ? { kind: 'ROOM', roomId: p.roomId }
            : p.targetKind === 'BED'
              ? { kind: 'BED', bedId: p.bedId }
              : { kind: 'SLOT', roomId: p.roomId };

      // `excludeBookingId` skips this booking's (about-to-be-deleted) rows.
      if (await this.conflicts.check(spec, range, { excludeBookingId: bookingId })) {
        throw new ConflictError();
      }

      stmts.push(
        this.db.insert(reservations).values({
          bookingId,
          bookerId: ownerId,
          userId: p.userId ?? null,
          guestName: p.userId ? null : p.guestName ?? null,
          targetKind: p.targetKind,
          roomId: spec.kind === 'ROOM' || spec.kind === 'SLOT' ? spec.roomId : null,
          bedId: spec.kind === 'BED' ? spec.bedId : null,
          startDate: input.startDate,
          endDate: input.endDate,
          status: initialStatus,
        }),
      );
    }

    await this.runBatch(stmts);

    const rows = (await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all()) as Reservation[];
    return { bookingId, rows };
  }

  async cancel(
    actorId: string,
    reservationId: string,
    opts?: { allowElevated?: boolean },
  ): Promise<void> {
    const existing = await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .all();
    const row = existing[0];
    if (!row) throw new NotFoundError('Reservation');
    const isParticipant = row.userId !== null && row.userId === actorId;
    const isBooker = row.bookerId === actorId;
    // The participant or the booker may always cancel their own stay; admins
    // and managers may cancel anyone's.
    if (!isParticipant && !isBooker && !opts?.allowElevated) throw new ForbiddenError();
    if (row.status === 'CANCELLED') return;

    await this.db
      .update(reservations)
      .set({ status: 'CANCELLED' })
      .where(eq(reservations.id, reservationId))
      .run();
  }

  async cancelBooking(
    actorId: string,
    bookingId: string,
    opts?: { allowElevated?: boolean },
  ): Promise<void> {
    const rows = await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all();
    if (rows.length === 0) throw new NotFoundError('Booking');
    // The booker may cancel their own booking; admins/managers may cancel any.
    if (!rows.every((r) => r.bookerId === actorId) && !opts?.allowElevated) {
      throw new ForbiddenError();
    }

    await this.db
      .update(reservations)
      .set({ status: 'CANCELLED' })
      .where(
        and(
          eq(reservations.bookingId, bookingId),
          or(
            eq(reservations.status, 'CONFIRMED'),
            eq(reservations.status, 'PENDING'),
          ),
        ),
      )
      .run();
  }

  /**
   * True while any ACTIVE (non-cancelled) reservation references this room —
   * directly (ROOM/SLOT target) or via one of its beds (BED target). Cancelling
   * a booking keeps its row with status CANCELLED, so those are ignored: a room
   * whose bookings were all cancelled is deletable. Used by the admin
   * room-delete guard.
   */
  async roomHasActiveReservations(roomId: string): Promise<boolean> {
    const bedIds = (
      await this.db.select({ id: beds.id }).from(beds).where(eq(beds.roomId, roomId)).all()
    ).map((b) => b.id);
    const targetsRoom =
      bedIds.length > 0
        ? or(eq(reservations.roomId, roomId), inArray(reservations.bedId, bedIds))
        : eq(reservations.roomId, roomId);
    const active = await this.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(ne(reservations.status, 'CANCELLED'), targetsRoom))
      .limit(1)
      .all();
    return active.length > 0;
  }

  /**
   * Approve every PENDING row in a booking (manager only — caller checks).
   * Idempotent: confirmed rows stay confirmed; cancelled rows are left alone.
   */
  async approveBooking(bookingId: string): Promise<void> {
    const rows = await this.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all();
    if (rows.length === 0) throw new NotFoundError('Booking');
    await this.db
      .update(reservations)
      .set({ status: 'CONFIRMED' })
      .where(
        and(
          eq(reservations.bookingId, bookingId),
          eq(reservations.status, 'PENDING'),
        ),
      )
      .run();
  }

  /**
   * Pending booking ids that conflict with `bookingId` — the other members of
   * its conflict cluster (overlapping requests competing for the same space).
   * Reads the current PENDING set, so call inside the serialised approval path.
   */
  private async conflictingPendingBookings(bookingId: string): Promise<string[]> {
    const rows = await this.db
      .select({
        rowId: reservations.id,
        bookingId: reservations.bookingId,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
        targetKind: reservations.targetKind,
        roomId: reservations.roomId,
        bedId: reservations.bedId,
        bedRoomId: beds.roomId,
      })
      .from(reservations)
      .leftJoin(beds, eq(beds.id, reservations.bedId))
      .where(eq(reservations.status, 'PENDING'))
      .all();

    const byBooking = new Map<string, ConflictInput>();
    for (const r of rows) {
      const key = r.bookingId ?? r.rowId;
      const entry =
        byBooking.get(key) ??
        { id: key, startDate: r.startDate, endDate: r.endDate, targets: [] };
      entry.targets.push({
        kind: r.targetKind,
        roomId: r.targetKind === 'BED' ? r.bedRoomId : r.roomId,
        bedId: r.bedId,
      });
      byBooking.set(key, entry);
    }
    if (!byBooking.has(bookingId)) return [];

    const roomRows = await this.db
      .select({ id: rooms.id, capacityMode: rooms.capacityMode, slotCount: rooms.slotCount })
      .from(rooms)
      .all();
    const bedRows = await this.db
      .select({ roomId: beds.roomId, kind: beds.kind })
      .from(beds)
      .all();
    const bedSlots = new Map<string, number>();
    for (const b of bedRows) {
      bedSlots.set(b.roomId, (bedSlots.get(b.roomId) ?? 0) + BED_CAPACITY[b.kind]);
    }
    const capacities = new Map<string, number | null>();
    for (const r of roomRows) {
      capacities.set(r.id, r.capacityMode === 'SLOTS' ? r.slotCount : (bedSlots.get(r.id) ?? 0));
    }

    const report = detectRequestConflicts([...byBooking.values()], capacities);
    const idx = report.clusterIndexById.get(bookingId);
    if (idx === undefined) return [];
    return report.clusters[idx]!.ids.filter((id) => id !== bookingId);
  }

  /**
   * Approve a booking and, atomically, reject every PENDING booking that
   * conflicts with it (its conflict cluster). Returns the rejected booking ids
   * so the caller can notify those bookers. For a booking with no conflicts
   * this is equivalent to {@link approveBooking}.
   */
  async approveBookingResolvingConflicts(
    bookingId: string,
  ): Promise<{ rejectedIds: string[] }> {
    const exists = await this.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all();
    if (exists.length === 0) throw new NotFoundError('Booking');

    const rejectedIds = await this.conflictingPendingBookings(bookingId);

    const stmts: BatchItem<'sqlite'>[] = [
      this.db
        .update(reservations)
        .set({ status: 'CONFIRMED' })
        .where(
          and(eq(reservations.bookingId, bookingId), eq(reservations.status, 'PENDING')),
        ),
    ];
    if (rejectedIds.length > 0) {
      stmts.push(
        this.db
          .update(reservations)
          .set({ status: 'CANCELLED' })
          .where(
            and(
              inArray(reservations.bookingId, rejectedIds),
              eq(reservations.status, 'PENDING'),
            ),
          ),
      );
    }
    await this.runBatch(stmts);
    return { rejectedIds };
  }

  /** Reject (cancel) every PENDING row in a booking (manager only). */
  async rejectBooking(bookingId: string): Promise<void> {
    const rows = await this.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.bookingId, bookingId))
      .all();
    if (rows.length === 0) throw new NotFoundError('Booking');
    await this.db
      .update(reservations)
      .set({ status: 'CANCELLED' })
      .where(
        and(
          eq(reservations.bookingId, bookingId),
          eq(reservations.status, 'PENDING'),
        ),
      )
      .run();
  }

  async listForUser(userId: string): Promise<Reservation[]> {
    return (await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.userId, userId))
      .orderBy(desc(reservations.startDate))
      .all()) as Reservation[];
  }

  async getById(reservationId: string): Promise<Reservation | undefined> {
    const rows = await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .all();
    return rows[0] as Reservation | undefined;
  }

  async findActive(userId: string): Promise<Reservation[]> {
    return (await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.userId, userId),
          or(
            eq(reservations.status, 'CONFIRMED'),
            eq(reservations.status, 'PENDING'),
          ),
        ),
      )
      .orderBy(reservations.startDate)
      .all()) as Reservation[];
  }
}

export type { CreateBookingInput };
