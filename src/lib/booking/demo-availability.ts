import { BED_CAPACITY } from '@/db/schema';
import { getDemoState } from '@/db/demo-cache';
import type { DemoReservationRow, DemoState } from '@/db/demo-state';
import { isDayFullyBooked, type RoomShape } from './capacity';
import type {
  AvailabilityTarget,
  BedOccupancy,
  DateRange,
  OccupantRef,
  PendingRef,
} from './types';

export interface DemoDayAssignment {
  roomId: string | null;
  name: string;
  fullCottage: boolean;
}

export interface DemoDayOccupancy {
  date: string;
  roomIds: string[];
  fullCottage: boolean;
  participants: string[];
  assignments: DemoDayAssignment[];
  pending: boolean;
  pendingParticipants: string[];
  fullyBooked: boolean;
}

function overlaps(row: DemoReservationRow, range: DateRange): boolean {
  return row.startDate <= range.endDate && row.endDate >= range.startDate;
}

function covers(row: DemoReservationRow, day: string): boolean {
  return row.startDate <= day && row.endDate >= day;
}

function included(row: DemoReservationRow, excludeBookingId?: string): boolean {
  return !excludeBookingId || row.bookingId == null || row.bookingId !== excludeBookingId;
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function displayName(state: DemoState, row: DemoReservationRow): string {
  const user = row.userId ? state.users.find((u) => u.id === row.userId) : null;
  return user?.name ?? user?.email ?? row.guestName ?? 'Someone';
}

function occupant(state: DemoState, row: DemoReservationRow): OccupantRef {
  const user = row.userId ? state.users.find((u) => u.id === row.userId) : null;
  return {
    userId: row.userId,
    name: displayName(state, row),
    isGuest: row.userId === null,
    isAdmin: user?.isAdmin ?? false,
    isManager: user?.isManager ?? false,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function pendingRef(state: DemoState, row: DemoReservationRow): PendingRef {
  return {
    name: displayName(state, row),
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function pushUniqueRef(target: PendingRef[], ref: PendingRef): void {
  if (
    target.some(
      (x) =>
        x.name === ref.name &&
        x.startDate === ref.startDate &&
        x.endDate === ref.endDate,
    )
  ) {
    return;
  }
  target.push(ref);
}

function uniqRefs(...lists: PendingRef[][]): PendingRef[] {
  const out: PendingRef[] = [];
  for (const ref of lists.flat()) pushUniqueRef(out, ref);
  return out;
}

function roomIdForReservation(state: DemoState, row: DemoReservationRow): string | null {
  if (row.roomId) return row.roomId;
  if (!row.bedId) return null;
  return state.beds.find((bed) => bed.id === row.bedId)?.roomId ?? null;
}

function roomCapacity(state: DemoState, roomId: string): number | null {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return 0;
  if (room.capacityMode === 'SLOTS') return room.slotCount;
  return state.beds
    .filter((bed) => bed.roomId === roomId)
    .reduce((sum, bed) => sum + BED_CAPACITY[bed.kind], 0);
}

function bedCapacity(state: DemoState, bedId: string): number {
  const bed = state.beds.find((b) => b.id === bedId);
  return bed ? BED_CAPACITY[bed.kind] : 0;
}

function pendingParticipants(state: DemoState, range: DateRange, excludeBookingId?: string) {
  const fullCottage: PendingRef[] = [];
  const roomLevel = new Map<string, PendingRef[]>();
  const bed = new Map<string, PendingRef[]>();

  for (const row of state.reservations) {
    if (row.status !== 'PENDING' || !overlaps(row, range) || !included(row, excludeBookingId)) {
      continue;
    }
    const ref = pendingRef(state, row);
    if (row.targetKind === 'FULL_COTTAGE') {
      pushUniqueRef(fullCottage, ref);
    } else if (row.targetKind === 'BED' && row.bedId) {
      const list = bed.get(row.bedId) ?? [];
      pushUniqueRef(list, ref);
      bed.set(row.bedId, list);
    } else {
      const roomId = roomIdForReservation(state, row);
      if (!roomId) continue;
      const list = roomLevel.get(roomId) ?? [];
      pushUniqueRef(list, ref);
      roomLevel.set(roomId, list);
    }
  }
  return { fullCottage, roomLevel, bed };
}

function confirmedRows(
  state: DemoState,
  range: DateRange,
  excludeBookingId?: string,
): DemoReservationRow[] {
  return state.reservations.filter(
    (row) =>
      row.status === 'CONFIRMED' &&
      overlaps(row, range) &&
      included(row, excludeBookingId),
  );
}

export async function getDemoAvailability(
  range: DateRange,
  excludeBookingId?: string,
): Promise<AvailabilityTarget[]> {
  const state = await getDemoState();
  const days = daysBetween(range.startDate, range.endDate);
  const confirmed = confirmedRows(state, range, excludeBookingId);
  const pending = pendingParticipants(state, range, excludeBookingId);
  const fullBlocked = confirmed.some((row) => row.targetKind === 'FULL_COTTAGE');

  const full: AvailabilityTarget = {
    kind: 'FULL_COTTAGE',
    available: confirmed.length === 0,
    pending: state.reservations.filter(
      (row) =>
        row.status === 'PENDING' &&
        row.targetKind === 'FULL_COTTAGE' &&
        overlaps(row, range) &&
        included(row, excludeBookingId),
    ).length,
    pendingParticipants: pending.fullCottage,
  };

  const roomTargets: AvailabilityTarget[] = state.rooms.map((room) => {
    const roomBeds = state.beds.filter((bed) => bed.roomId === room.id);
    const capacity = roomCapacity(state, room.id);
    const bedOccupancy: BedOccupancy[] =
      room.capacityMode === 'BEDS'
        ? roomBeds.map((bed) => {
            const capacity = bedCapacity(state, bed.id);
            let takenByOthers = 0;
            for (const day of days) {
              const exclusive = confirmed.some(
                (row) =>
                  covers(row, day) &&
                  (row.targetKind === 'FULL_COTTAGE' ||
                    (row.targetKind === 'ROOM' && row.roomId === room.id)),
              );
              const taken = exclusive
                ? capacity
                : confirmed.filter(
                    (row) =>
                      covers(row, day) &&
                      row.targetKind === 'BED' &&
                      row.bedId === bed.id,
                  ).length;
              takenByOthers = Math.max(takenByOthers, taken);
            }
            const takenBy = confirmed
              .filter(
                (row) =>
                  row.targetKind === 'FULL_COTTAGE' ||
                  (row.targetKind === 'ROOM' && row.roomId === room.id) ||
                  (row.targetKind === 'BED' && row.bedId === bed.id),
              )
              .map((row) => occupant(state, row));
            return {
              bedId: bed.id,
              capacity,
              takenByOthers,
              takenBy,
              pending: state.reservations.filter(
                (row) =>
                  row.status === 'PENDING' &&
                  overlaps(row, range) &&
                  included(row, excludeBookingId) &&
                  ((row.targetKind === 'BED' && row.bedId === bed.id) ||
                    (row.targetKind === 'ROOM' && row.roomId === room.id) ||
                    row.targetKind === 'FULL_COTTAGE'),
              ).length,
              pendingParticipants: uniqRefs(
                pending.bed.get(bed.id) ?? [],
                pending.roomLevel.get(room.id) ?? [],
              ),
            };
          })
        : [];

    let taken = 0;
    for (const day of days) {
      const dayTaken = confirmed.filter((row) => {
        if (!covers(row, day)) return false;
        if (row.targetKind === 'SLOT' || row.targetKind === 'ROOM') return row.roomId === room.id;
        if (row.targetKind === 'BED') return roomIdForReservation(state, row) === room.id;
        return false;
      }).length;
      taken = Math.max(taken, dayTaken);
    }
    if (fullBlocked && capacity != null) taken = capacity;

    const roomPendingRefs = uniqRefs(
      pending.roomLevel.get(room.id) ?? [],
      ...roomBeds.map((bed) => pending.bed.get(bed.id) ?? []),
    );

    return {
      kind: 'SLOT_ROOM',
      roomId: room.id,
      nameNb: room.nameNb,
      nameEn: room.nameEn,
      icon: room.icon,
      color: room.color,
      capacity,
      taken,
      takenBy: confirmed
        .filter(
          (row) =>
            (row.targetKind === 'SLOT' || row.targetKind === 'ROOM') &&
            row.roomId === room.id,
        )
        .map((row) => occupant(state, row)),
      pending: state.reservations.filter((row) => {
        if (row.status !== 'PENDING' || !overlaps(row, range) || !included(row, excludeBookingId)) {
          return false;
        }
        return roomIdForReservation(state, row) === room.id;
      }).length,
      pendingParticipants: roomPendingRefs,
      beds: bedOccupancy,
    };
  });

  return [full, ...roomTargets];
}

export async function getDemoOccupancy(from: string, to: string): Promise<DemoDayOccupancy[]> {
  const state = await getDemoState();
  const days = daysBetween(from, to);
  const byDay = new Map<string, DemoDayOccupancy>();
  const seenAssignments = new Map<string, Set<string>>();

  for (const day of days) {
    byDay.set(day, {
      date: day,
      roomIds: [],
      fullCottage: false,
      participants: [],
      assignments: [],
      pending: false,
      pendingParticipants: [],
      fullyBooked: false,
    });
  }

  for (const row of state.reservations) {
    if (row.status !== 'PENDING' && row.status !== 'CONFIRMED') continue;
    for (const day of days) {
      if (!covers(row, day)) continue;
      const entry = byDay.get(day);
      if (!entry) continue;
      const name = displayName(state, row);
      if (row.status === 'PENDING') {
        entry.pending = true;
        if (!entry.pendingParticipants.includes(name)) entry.pendingParticipants.push(name);
        continue;
      }

      const isFull = row.targetKind === 'FULL_COTTAGE';
      const roomId = isFull ? null : roomIdForReservation(state, row);
      if (isFull) entry.fullCottage = true;
      if (roomId && !entry.roomIds.includes(roomId)) entry.roomIds.push(roomId);
      if (!entry.participants.includes(name)) entry.participants.push(name);

      const key = `${isFull ? '*' : roomId ?? ''}|${name}`;
      const seen = seenAssignments.get(day) ?? new Set<string>();
      if (!seen.has(key)) {
        seen.add(key);
        entry.assignments.push({ roomId, name, fullCottage: isFull });
        seenAssignments.set(day, seen);
      }
    }
  }

  const shapes: RoomShape[] = state.rooms.map((room) => ({
    id: room.id,
    mode: room.capacityMode,
    slotCount: room.slotCount,
    bedCount: state.beds.filter((bed) => bed.roomId === room.id).length,
  }));
  const hasUnlimitedSlots = shapes.some((room) => room.mode === 'SLOTS' && room.slotCount == null);
  const needsDetail = shapes.length > 0 && !hasUnlimitedSlots;
  const bedTaken = new Map<string, Map<string, number>>();
  const slotTaken = new Map<string, Map<string, number>>();

  if (needsDetail) {
    for (const day of days) {
      const bedMap = new Map<string, Set<string>>();
      const slotMap = new Map<string, number>();
      for (const row of state.reservations) {
        if (row.status !== 'CONFIRMED' || !covers(row, day)) continue;
        if (row.targetKind === 'FULL_COTTAGE') {
          for (const bed of state.beds) {
            const taken = bedMap.get(bed.roomId) ?? new Set<string>();
            taken.add(bed.id);
            bedMap.set(bed.roomId, taken);
          }
        } else if (row.targetKind === 'ROOM' && row.roomId) {
          for (const bed of state.beds.filter((b) => b.roomId === row.roomId)) {
            const taken = bedMap.get(row.roomId) ?? new Set<string>();
            taken.add(bed.id);
            bedMap.set(row.roomId, taken);
          }
          slotMap.set(row.roomId, (slotMap.get(row.roomId) ?? 0) + 1);
        } else if (row.targetKind === 'BED' && row.bedId) {
          const roomId = roomIdForReservation(state, row);
          if (!roomId) continue;
          const taken = bedMap.get(roomId) ?? new Set<string>();
          taken.add(row.bedId);
          bedMap.set(roomId, taken);
        } else if (row.targetKind === 'SLOT' && row.roomId) {
          slotMap.set(row.roomId, (slotMap.get(row.roomId) ?? 0) + 1);
        }
      }
      bedTaken.set(
        day,
        new Map([...bedMap.entries()].map(([roomId, beds]) => [roomId, beds.size])),
      );
      slotTaken.set(day, slotMap);
    }
  }

  const empty = new Map<string, number>();
  for (const entry of byDay.values()) {
    entry.fullyBooked = isDayFullyBooked(
      shapes,
      entry.fullCottage,
      bedTaken.get(entry.date) ?? empty,
      slotTaken.get(entry.date) ?? empty,
    );
  }

  return [...byDay.values()];
}
