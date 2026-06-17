'use client';

import { fetchGroupForBooking } from '@/server/actions/group-preset';
import { collectBookedUserIds } from '@/components/booking/booked-users';
import type {
  ParticipantPick,
  PickerBed,
  PickerRoom,
  Selection,
} from '@/components/booking/RoomBedPicker.desktop';
import type { AvailabilityTarget } from '@/lib/booking/types';

/** A group member as pulled from the server, with their seating preference. */
export interface GroupMember {
  userId: string | null;
  guestName: string | null;
  preferredRoomId: string | null;
  preferredBedId: string | null;
}

/**
 * What happened to a member while applying the group, surfaced to the user as a
 * toast. `name` is always the affected person; `replaced` names the person who
 * was bumped out of a bed, not the group member taking it.
 */
export type GroupApplyWarning =
  | { kind: 'moved'; name: string }
  | { kind: 'replaced'; name: string }
  | { kind: 'preferredTaken'; name: string; roomName: string }
  | { kind: 'keptPreferred'; name: string }
  | { kind: 'noSpace'; name: string }
  | { kind: 'alreadyBooked'; name: string };

export interface ApplyContext {
  rooms: PickerRoom[];
  beds: PickerBed[];
  /** Availability for the selected dates, or `[]` when no dates are picked yet
   *  (then occupancy-aware steps are skipped — placement is preference-only). */
  availability: AvailabilityTarget[];
  /** Display name for a pick (registered users resolve via the users list). */
  nameOf: (pick: ParticipantPick) => string;
  /** Localised room name for toasts. */
  roomNameOf: (room: PickerRoom) => string;
}

/** Thin wrapper so callers import all group-apply logic from one module. */
export async function loadGroupMembers(groupId: string): Promise<GroupMember[] | null> {
  const data = await fetchGroupForBooking(groupId);
  return data ? data.members : null;
}

/**
 * Turn apply warnings into ready-to-show toast strings, one per outcome kind so
 * a big group doesn't fire ten toasts. `t` is the `Book` namespace translator.
 */
export function groupWarningMessages(
  warnings: GroupApplyWarning[],
  t: (key: string, values?: Record<string, string | number>) => string,
): string[] {
  const namesFor = (kind: GroupApplyWarning['kind']) => [
    ...new Set(warnings.filter((w) => w.kind === kind).map((w) => w.name)),
  ];
  const out: string[] = [];
  const order: Array<[GroupApplyWarning['kind'], string]> = [
    ['moved', 'groupMoved'],
    ['replaced', 'groupReplaced'],
    ['preferredTaken', 'groupPreferredTaken'],
    ['keptPreferred', 'groupPreferredKept'],
    ['noSpace', 'groupNoSpace'],
    ['alreadyBooked', 'groupAlreadyBooked'],
  ];
  for (const [kind, key] of order) {
    const ns = namesFor(kind);
    // `count` lets the message pick singular/plural verb agreement.
    if (ns.length > 0) out.push(t(key, { names: ns.join(', '), count: ns.length }));
  }
  return out;
}

/**
 * Picks that sit in a *different* room/bed in `to` than they did in `from`
 * (present in both, moved). Used when unselecting a group: restoring the
 * pre-group layout shifts people back, and those moves get their own toast.
 */
export function selectionMoves(from: Selection, to: Selection): ParticipantPick[] {
  const placeOf = (sel: Selection) => {
    const m = new Map<string, { roomId: string; bedId?: string }>();
    for (const [roomId, list] of Object.entries(sel.rooms)) {
      for (const p of list) m.set(keyOf(p), { roomId, bedId: p.bedId });
    }
    return m;
  };
  const before = placeOf(from);
  const moved: ParticipantPick[] = [];
  for (const [roomId, list] of Object.entries(to.rooms)) {
    for (const p of list) {
      const prev = before.get(keyOf(p));
      if (prev && (prev.roomId !== roomId || prev.bedId !== p.bedId)) moved.push(p);
    }
  }
  return moved;
}

/* --------------------------- pick identity helpers --------------------------- */

function pickOf(m: GroupMember): ParticipantPick {
  return m.userId
    ? { kind: 'user', userId: m.userId }
    : { kind: 'guest', name: m.guestName ?? '' };
}

/** Stable identity key — registered users by id, guests by name. */
function keyOf(p: ParticipantPick): string {
  return p.kind === 'user' ? `u:${p.userId}` : `g:${p.name}`;
}

/** Merge two pick lists, deduping registered users by id (first wins); guests
 *  append. Mirrors the picker's own merge semantics. */
function mergeList(a: ParticipantPick[], b: ParticipantPick[]): ParticipantPick[] {
  const seen = new Set<string>();
  const out: ParticipantPick[] = [];
  for (const p of [...a, ...b]) {
    if (p.kind === 'user') {
      if (seen.has(p.userId)) continue;
      seen.add(p.userId);
    }
    out.push(p);
  }
  return out;
}

/* ------------------------------ capacity ledger ------------------------------ */

interface BedSlot {
  bedId: string;
  capacity: number; // 1 single, 2 double
  others: number; // peak concurrent occupants from other bookings
  mine: number; // running count this booking has placed on the bed
}

interface RoomLedger {
  room: PickerRoom;
  mode: 'BEDS' | 'SLOTS';
  capacity: number | null; // null = unlimited (SLOTS room with no cap)
  others: number; // peak others (SLOTS) / sum of bed others (BEDS)
  mine: number;
  beds: BedSlot[]; // BEDS rooms only
}

/** Build a per-room capacity ledger seeded with other bookings' occupancy. */
function buildLedger(ctx: ApplyContext): Map<string, RoomLedger> {
  const avByRoom = new Map<string, Extract<AvailabilityTarget, { kind: 'SLOT_ROOM' }>>();
  for (const a of ctx.availability) if (a.kind === 'SLOT_ROOM') avByRoom.set(a.roomId, a);

  const ledger = new Map<string, RoomLedger>();
  for (const room of ctx.rooms) {
    const av = avByRoom.get(room.id);
    if (room.capacityMode === 'BEDS') {
      const bedOthers = new Map((av?.beds ?? []).map((b) => [b.bedId, b.takenByOthers]));
      const beds: BedSlot[] = ctx.beds
        .filter((b) => b.roomId === room.id)
        .map((b) => ({
          bedId: b.id,
          capacity: b.kind === 'DOUBLE' ? 2 : 1,
          others: bedOthers.get(b.id) ?? 0,
          mine: 0,
        }));
      ledger.set(room.id, {
        room,
        mode: 'BEDS',
        capacity: beds.reduce((a, b) => a + b.capacity, 0),
        others: beds.reduce((a, b) => a + b.others, 0),
        mine: 0,
        beds,
      });
    } else {
      ledger.set(room.id, {
        room,
        mode: 'SLOTS',
        capacity: room.slotCount,
        others: av ? av.taken : 0,
        mine: 0,
        beds: [],
      });
    }
  }
  return ledger;
}

/** Free seats this booking can still take in a room (∞ for uncapped slots). */
function roomFree(l: RoomLedger): number {
  if (l.mode === 'SLOTS') {
    return l.capacity == null ? Number.POSITIVE_INFINITY : l.capacity - l.others - l.mine;
  }
  return l.beds.reduce((a, b) => a + Math.max(0, b.capacity - b.others - b.mine), 0);
}

function bedFree(l: RoomLedger, bedId: string): number {
  const b = l.beds.find((x) => x.bedId === bedId);
  return b ? b.capacity - b.others - b.mine : 0;
}

function firstFreeBed(l: RoomLedger): string | undefined {
  return l.beds.find((b) => b.capacity - b.others - b.mine > 0)?.bedId;
}

/* ------------------------------ apply the group ------------------------------ */

/**
 * Re-derive the selection from `base` (the layout before any group was applied)
 * plus a group's seating preferences. Every member ends up placed **once**:
 *   - a member already sitting somewhere is *moved* to the group's choice;
 *   - a preferred bed held by someone else in this draft *replaces* them;
 *   - a preferred spot taken by another booking falls back to the first free
 *     room; a member who can't fit anywhere, or who is already booked these
 *     dates, is dropped.
 * Each non-trivial outcome is reported in `warnings` for a toast. Pure — the
 * caller snapshots `base` so unselecting the group can restore it.
 */
export function applyGroupToSelection(
  base: Selection,
  members: GroupMember[],
  ctx: ApplyContext,
): { selection: Selection; warnings: GroupApplyWarning[] } {
  const warnings: GroupApplyWarning[] = [];
  const ledger = buildLedger(ctx);
  const orderedRooms = [...ledger.values()].sort((a, b) =>
    a.room.nameNb.localeCompare(b.room.nameNb),
  );
  const bookedElsewhere = collectBookedUserIds(ctx.availability);

  const memberKeys = new Set(members.map((m) => keyOf(pickOf(m))));
  // Where each member sat in `base` (to detect a genuine "move").
  const basePlacement = new Map<string, { roomId: string; bedId?: string }>();

  // Seed `rooms` with base occupants who AREN'T group members, charging their
  // seats to the ledger; group members are pulled out so we can re-place them.
  const rooms: Record<string, ParticipantPick[]> = {};
  for (const [roomId, list] of Object.entries(base.rooms)) {
    const l = ledger.get(roomId);
    const kept: ParticipantPick[] = [];
    for (const p of list) {
      const k = keyOf(p);
      if (memberKeys.has(k)) {
        basePlacement.set(k, { roomId, bedId: p.bedId });
        continue;
      }
      kept.push(p);
      if (l) {
        l.mine += 1;
        if (p.bedId) {
          const b = l.beds.find((x) => x.bedId === p.bedId);
          if (b) b.mine += 1;
        }
      }
    }
    if (kept.length > 0) rooms[roomId] = kept;
  }

  const removedKeys = new Set<string>(); // occupants bumped out / members dropped
  const placedKeys = new Set<string>();

  const place = (roomId: string, pick: ParticipantPick, bedId?: string) => {
    const l = ledger.get(roomId)!;
    rooms[roomId] = [...(rooms[roomId] ?? []), bedId ? { ...pick, bedId } : { ...pick }];
    l.mine += 1;
    if (bedId) {
      const b = l.beds.find((x) => x.bedId === bedId);
      if (b) b.mine += 1;
    }
  };

  for (const m of members) {
    const pick = pickOf(m);
    const key = keyOf(pick);
    const name = ctx.nameOf(pick);

    // Already booked/reserved elsewhere for these dates → can't be placed at all.
    if (pick.kind === 'user' && bookedElsewhere.has(pick.userId)) {
      warnings.push({ kind: 'alreadyBooked', name });
      removedKeys.add(key);
      continue;
    }

    const pref = m.preferredRoomId ? ledger.get(m.preferredRoomId) : undefined;
    let targetRoom: string | undefined;
    let targetBed: string | undefined;
    let preferredBlocked = false;

    if (pref) {
      if (pref.mode === 'BEDS' && m.preferredBedId) {
        if (bedFree(pref, m.preferredBedId) > 0) {
          // The bed still has room (a double sleeps two) — just take it, no bump.
          targetRoom = pref.room.id;
          targetBed = m.preferredBedId;
        } else {
          // Bed is full. If a *non-group* draft occupant fills it, bump them to
          // honour the preference (replace + warn). If it's full from other
          // bookings — or from another group member we already placed — leave
          // them put and relocate this member instead, so nobody intended for a
          // spot gets silently dropped.
          const occ = (rooms[pref.room.id] ?? []).find(
            (p) =>
              p.bedId === m.preferredBedId && keyOf(p) !== key && !memberKeys.has(keyOf(p)),
          );
          if (occ) {
            rooms[pref.room.id] = (rooms[pref.room.id] ?? []).filter((p) => p !== occ);
            pref.mine -= 1;
            const bo = pref.beds.find((b) => b.bedId === m.preferredBedId);
            if (bo) bo.mine -= 1;
            removedKeys.add(keyOf(occ));
            warnings.push({ kind: 'replaced', name: ctx.nameOf(occ) });
            targetRoom = pref.room.id;
            targetBed = m.preferredBedId;
          } else {
            preferredBlocked = true; // full by others / other group members
          }
        }
      } else if (roomFree(pref) > 0) {
        targetRoom = pref.room.id;
        if (pref.mode === 'BEDS') targetBed = firstFreeBed(pref);
      } else {
        preferredBlocked = true;
      }
    }

    // Preferred spot couldn't be honoured. Keep the member exactly where they
    // already sat rather than shuffling them to a different bed — only an
    // *available* preferred bed earns a move, otherwise applying the group
    // would needlessly churn placements. A brand-new member with nowhere to sit
    // falls back to the first free room.
    if (!targetRoom) {
      const basePlace = basePlacement.get(key);
      const baseLedger = basePlace ? ledger.get(basePlace.roomId) : undefined;
      const baseStillFree =
        basePlace && baseLedger
          ? basePlace.bedId
            ? bedFree(baseLedger, basePlace.bedId) > 0
            : roomFree(baseLedger) > 0
          : false;
      if (basePlace && baseStillFree) {
        // Stay put. Warn only if they actually wanted to be somewhere else —
        // their preferred spot was taken, so we couldn't honour the move.
        targetRoom = basePlace.roomId;
        targetBed = basePlace.bedId;
        if (m.preferredRoomId) warnings.push({ kind: 'keptPreferred', name });
      } else {
        const fb = orderedRooms.find((l) => roomFree(l) > 0);
        if (!fb) {
          warnings.push({ kind: 'noSpace', name });
          removedKeys.add(key);
          continue;
        }
        targetRoom = fb.room.id;
        if (fb.mode === 'BEDS') targetBed = firstFreeBed(fb);
        if (m.preferredRoomId || preferredBlocked) {
          warnings.push({ kind: 'preferredTaken', name, roomName: ctx.roomNameOf(fb.room) });
        }
      }
    }

    place(targetRoom, pick, targetBed);
    placedKeys.add(key);

    // "Moved" only when they actually sat somewhere else in the base layout.
    const was = basePlacement.get(key);
    if (was && (was.roomId !== targetRoom || was.bedId !== targetBed)) {
      warnings.push({ kind: 'moved', name });
    }
  }

  // Drop now-empty room lists.
  for (const roomId of Object.keys(rooms)) {
    if (rooms[roomId]!.length === 0) delete rooms[roomId];
  }

  // Cottage bucket (only seen if the user toggles to whole-cottage mode): base
  // cottage minus anyone removed, plus every member we actually placed.
  const placedMemberPicks = members
    .map(pickOf)
    .filter((p) => placedKeys.has(keyOf(p)));
  const cottage = mergeList(
    base.fullCottageParticipants.filter((p) => !removedKeys.has(keyOf(p))),
    placedMemberPicks,
  );

  return {
    selection: { mode: base.mode, fullCottageParticipants: cottage, rooms },
    warnings,
  };
}
