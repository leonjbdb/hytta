'use client';

import { fetchGroupForBooking } from '@/server/actions/group-preset';
import type {
  ParticipantPick,
  PickerBed,
  PickerRoom,
  Selection,
} from '@/components/booking/RoomBedPicker.desktop';

interface ApplyContext {
  rooms: PickerRoom[];
  beds: PickerBed[];
}

/**
 * Participants a group adds to the booking, split by destination. Persists
 * across re-renders so that switching or unselecting a group can subtract
 * exactly what the previous group injected, without touching anything the
 * user added manually.
 */
export interface GroupContribution {
  cottage: ParticipantPick[];
  rooms: Record<string, ParticipantPick[]>;
}

function roomCapacity(room: PickerRoom, beds: PickerBed[]): number | null {
  if (room.capacityMode === 'SLOTS') return room.slotCount;
  return beds
    .filter((b) => b.roomId === room.id)
    .reduce((acc, b) => acc + (b.kind === 'DOUBLE' ? 2 : 1), 0);
}

function picksEqual(a: ParticipantPick, b: ParticipantPick): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'user' && b.kind === 'user') return a.userId === b.userId;
  if (a.kind === 'guest' && b.kind === 'guest') return a.name === b.name;
  return false;
}

function containsPick(list: ParticipantPick[], pick: ParticipantPick): boolean {
  return list.some((p) => picksEqual(p, pick));
}

/** Remove first matching occurrence of each pick in `remove` from `target`. */
function subtractList(
  target: ParticipantPick[],
  remove: ParticipantPick[],
): ParticipantPick[] {
  const out = [...target];
  for (const r of remove) {
    const idx = out.findIndex((p) => picksEqual(p, r));
    if (idx !== -1) out.splice(idx, 1);
  }
  return out;
}

function subtractRooms(
  target: Record<string, ParticipantPick[]>,
  remove: Record<string, ParticipantPick[]>,
): Record<string, ParticipantPick[]> {
  const out: Record<string, ParticipantPick[]> = {};
  for (const [rid, list] of Object.entries(target)) {
    const next = subtractList(list, remove[rid] ?? []);
    if (next.length > 0) out[rid] = next;
  }
  return out;
}

/** Merge two participant lists — registered users dedup by id (first wins);
 *  guests append. Mirrors the picker's own merge semantics. */
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

function mergeRooms(
  target: Record<string, ParticipantPick[]>,
  add: Record<string, ParticipantPick[]>,
): Record<string, ParticipantPick[]> {
  const out: Record<string, ParticipantPick[]> = { ...target };
  for (const [rid, list] of Object.entries(add)) {
    out[rid] = mergeList(out[rid] ?? [], list);
  }
  return out;
}

/**
 * Pulls a group template and returns the participants it would add, bucketed
 * for both viewing modes (so flipping modes after applying still shows the
 * group). Both halves are populated:
 *   - `cottage` — every member, deduped by user.
 *   - `rooms` — members bucketed by `preferredRoomId`. Members with no
 *     preference are placed into the first alphabetical room with free
 *     capacity.
 */
export async function fetchGroupContribution(
  groupId: string,
  ctx: ApplyContext,
): Promise<GroupContribution | null> {
  const data = await fetchGroupForBooking(groupId);
  if (!data) return null;

  const cottage: ParticipantPick[] = [];
  const seenUsers = new Set<string>();
  for (const m of data.members) {
    const pick: ParticipantPick = m.userId
      ? { kind: 'user', userId: m.userId }
      : { kind: 'guest', name: m.guestName ?? '' };
    if (pick.kind === 'user') {
      if (seenUsers.has(pick.userId)) continue;
      seenUsers.add(pick.userId);
    }
    cottage.push(pick);
  }

  const rooms: Record<string, ParticipantPick[]> = {};
  const orderedRooms = [...ctx.rooms].sort((a, b) => a.nameNb.localeCompare(b.nameNb));

  for (const m of data.members) {
    if (!m.preferredRoomId) continue;
    const pick: ParticipantPick = m.userId
      ? { kind: 'user', userId: m.userId }
      : { kind: 'guest', name: m.guestName ?? '' };
    // A preferred bed pre-places the member on that specific bed (ignored for
    // slot rooms at submit time).
    if (m.preferredBedId) pick.bedId = m.preferredBedId;
    const list = rooms[m.preferredRoomId] ?? [];
    list.push(pick);
    rooms[m.preferredRoomId] = list;
  }

  for (const m of data.members) {
    if (m.preferredRoomId) continue;
    const pick: ParticipantPick = m.userId
      ? { kind: 'user', userId: m.userId }
      : { kind: 'guest', name: m.guestName ?? '' };
    const target = orderedRooms.find((r) => {
      const cap = roomCapacity(r, ctx.beds);
      const used = rooms[r.id]?.length ?? 0;
      return cap == null || used < cap;
    });
    if (!target) continue;
    const list = rooms[target.id] ?? [];
    list.push(pick);
    rooms[target.id] = list;
  }

  return { cottage, rooms };
}

/** Remove a previously-applied group's contribution from the selection. */
export function subtractContribution(
  selection: Selection,
  remove: GroupContribution | null,
): Selection {
  if (!remove) return selection;
  return {
    mode: selection.mode,
    fullCottageParticipants: subtractList(selection.fullCottageParticipants, remove.cottage),
    rooms: subtractRooms(selection.rooms, remove.rooms),
  };
}

/**
 * Merge a group contribution into a selection. Returns the merged selection
 * plus the *actual* additions (contribution items that weren't already
 * present) — store this as the new prev-contribution so a later subtract
 * doesn't strip picks the user had before the group was applied.
 */
export function mergeContribution(
  selection: Selection,
  add: GroupContribution,
): { selection: Selection; added: GroupContribution } {
  const addedCottage = add.cottage.filter(
    (p) => !containsPick(selection.fullCottageParticipants, p),
  );
  const addedRooms: Record<string, ParticipantPick[]> = {};
  for (const [rid, list] of Object.entries(add.rooms)) {
    const existing = selection.rooms[rid] ?? [];
    const novel = list.filter((p) => !containsPick(existing, p));
    if (novel.length > 0) addedRooms[rid] = novel;
  }
  return {
    selection: {
      mode: selection.mode,
      fullCottageParticipants: mergeList(selection.fullCottageParticipants, add.cottage),
      rooms: mergeRooms(selection.rooms, add.rooms),
    },
    added: { cottage: addedCottage, rooms: addedRooms },
  };
}
