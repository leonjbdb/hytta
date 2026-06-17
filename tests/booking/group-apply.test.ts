import { describe, expect, it } from 'bun:test';
import {
  applyGroupToSelection,
  selectionMoves,
  type ApplyContext,
  type GroupMember,
} from '@/lib/booking/group-preset';
import type {
  ParticipantPick,
  PickerBed,
  PickerRoom,
  Selection,
} from '@/components/booking/RoomBedPicker.desktop';
import type { AvailabilityTarget } from '@/lib/booking/types';

/* ------------------------------- fixtures ------------------------------- */

const room = (
  id: string,
  nameNb: string,
  capacityMode: 'BEDS' | 'SLOTS',
  slotCount: number | null = null,
): PickerRoom => ({ id, nameNb, nameEn: nameNb, icon: 'bed', color: '#000', capacityMode, slotCount });

const bed = (id: string, roomId: string, kind: 'SINGLE' | 'DOUBLE' = 'SINGLE'): PickerBed => ({
  id,
  roomId,
  kind,
  label: id,
});

const u = (userId: string, bedId?: string): ParticipantPick => ({ kind: 'user', userId, ...(bedId ? { bedId } : {}) });

const member = (over: Partial<GroupMember>): GroupMember => ({
  userId: null,
  guestName: null,
  preferredRoomId: null,
  preferredBedId: null,
  ...over,
});

const slotRoomAv = (
  roomId: string,
  over: Partial<Extract<AvailabilityTarget, { kind: 'SLOT_ROOM' }>> = {},
): AvailabilityTarget => ({
  kind: 'SLOT_ROOM',
  roomId,
  nameNb: roomId,
  nameEn: roomId,
  icon: 'bed',
  color: '#000',
  capacity: null,
  taken: 0,
  takenBy: [],
  pending: 0,
  pendingParticipants: [],
  beds: [],
  ...over,
});

const occupant = (userId: string) => ({
  userId,
  name: userId,
  isGuest: false,
  isAdmin: false,
  isManager: false,
  startDate: '2026-01-01',
  endDate: '2026-01-02',
});

const ctxOf = (
  over: Pick<ApplyContext, 'rooms' | 'beds'> & Partial<ApplyContext>,
): ApplyContext => ({
  availability: [],
  nameOf: (p) => (p.kind === 'user' ? p.userId : p.name),
  roomNameOf: (r) => r.nameNb,
  ...over,
});

const ROOMS: Selection['mode'] = 'ROOMS';

/** Flatten every userId placed across all rooms (to assert single placement). */
const placedUsers = (sel: Selection): string[] =>
  Object.values(sel.rooms)
    .flat()
    .filter((p): p is Extract<ParticipantPick, { kind: 'user' }> => p.kind === 'user')
    .map((p) => p.userId);

/* -------------------------------- tests --------------------------------- */

describe('applyGroupToSelection', () => {
  it('moves an already-placed member to the group preference, never duplicating', () => {
    const base: Selection = { mode: ROOMS, fullCottageParticipants: [], rooms: { A: [u('u1')] } };
    const ctx = ctxOf({
      rooms: [room('A', 'A', 'SLOTS'), room('B', 'B', 'SLOTS')],
      beds: [],
    });
    const { selection, warnings } = applyGroupToSelection(
      base,
      [member({ userId: 'u1', preferredRoomId: 'B' })],
      ctx,
    );
    expect(placedUsers(selection)).toEqual(['u1']); // exactly once
    expect(selection.rooms.B?.map((p) => (p.kind === 'user' ? p.userId : ''))).toEqual(['u1']);
    expect(selection.rooms.A).toBeUndefined();
    expect(warnings).toContainEqual({ kind: 'moved', name: 'u1' });
  });

  it('does not warn "moved" when the member already sits in the preferred spot', () => {
    const base: Selection = { mode: ROOMS, fullCottageParticipants: [], rooms: { B: [u('u1')] } };
    const ctx = ctxOf({ rooms: [room('A', 'A', 'SLOTS'), room('B', 'B', 'SLOTS')], beds: [] });
    const { warnings } = applyGroupToSelection(
      base,
      [member({ userId: 'u1', preferredRoomId: 'B' })],
      ctx,
    );
    expect(warnings).toHaveLength(0);
  });

  it('replaces a different draft occupant holding the preferred bed', () => {
    const base: Selection = {
      mode: ROOMS,
      fullCottageParticipants: [],
      rooms: { A: [u('x', 'a1')] },
    };
    const ctx = ctxOf({ rooms: [room('A', 'A', 'BEDS')], beds: [bed('a1', 'A', 'SINGLE')] });
    const { selection, warnings } = applyGroupToSelection(
      base,
      [member({ userId: 'u1', preferredRoomId: 'A', preferredBedId: 'a1' })],
      ctx,
    );
    expect(placedUsers(selection)).toEqual(['u1']); // x bumped, u1 in
    expect(selection.rooms.A?.[0]).toEqual({ kind: 'user', userId: 'u1', bedId: 'a1' });
    expect(warnings).toContainEqual({ kind: 'replaced', name: 'x' });
  });

  it('shares a double bed instead of bumping its occupant when a seat is free', () => {
    const base: Selection = {
      mode: ROOMS,
      fullCottageParticipants: [],
      rooms: { A: [u('x', 'a1')] }, // x already on the double bed (1 of 2)
    };
    const ctx = ctxOf({ rooms: [room('A', 'A', 'BEDS')], beds: [bed('a1', 'A', 'DOUBLE')] });
    const { selection, warnings } = applyGroupToSelection(
      base,
      [member({ userId: 'u1', preferredRoomId: 'A', preferredBedId: 'a1' })],
      ctx,
    );
    // Both share a1; nobody bumped, nobody relocated.
    expect(new Set(placedUsers(selection))).toEqual(new Set(['x', 'u1']));
    expect(selection.rooms.A?.every((p) => p.bedId === 'a1')).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('relocates the second member when two prefer the same single bed (no drop)', () => {
    const ctx = ctxOf({
      rooms: [room('A', 'A', 'BEDS'), room('B', 'B', 'BEDS')],
      beds: [bed('a1', 'A', 'SINGLE'), bed('b1', 'B', 'SINGLE')],
    });
    const { selection, warnings } = applyGroupToSelection(
      { mode: ROOMS, fullCottageParticipants: [], rooms: {} },
      [
        member({ userId: 'u1', preferredRoomId: 'A', preferredBedId: 'a1' }),
        member({ userId: 'u2', preferredRoomId: 'A', preferredBedId: 'a1' }),
      ],
      ctx,
    );
    // u1 takes a1; u2 can't (full by a group member) → relocated to B, not dropped.
    expect(new Set(placedUsers(selection))).toEqual(new Set(['u1', 'u2']));
    expect(selection.rooms.A?.map((p) => (p.kind === 'user' ? p.userId : ''))).toEqual(['u1']);
    expect(selection.rooms.B?.length).toBe(1);
    expect(warnings).toContainEqual({ kind: 'preferredTaken', name: 'u2', roomName: 'B' });
    // The first member is never "removed/replaced".
    expect(warnings.some((w) => w.kind === 'replaced')).toBe(false);
  });

  it('keeps an already-seated member put when the preferred room is full (no churn)', () => {
    const base: Selection = {
      mode: ROOMS,
      fullCottageParticipants: [],
      rooms: { B: [u('u1')] }, // u1 already sits in B
    };
    const ctx = ctxOf({
      rooms: [room('A', 'A', 'SLOTS', 1), room('B', 'B', 'SLOTS', 5), room('C', 'C', 'SLOTS', 5)],
      beds: [],
      availability: [slotRoomAv('A', { capacity: 1, taken: 1 })], // preferred A is full
    });
    const { selection, warnings } = applyGroupToSelection(
      base,
      [member({ userId: 'u1', preferredRoomId: 'A' })],
      ctx,
    );
    // u1 stays in B — not relocated to C, not reported as moved/relocated...
    expect(selection.rooms.B?.map((p) => (p.kind === 'user' ? p.userId : ''))).toEqual(['u1']);
    expect(selection.rooms.C).toBeUndefined();
    // ...but warned that their preferred spot couldn't be honoured.
    expect(warnings).toEqual([{ kind: 'keptPreferred', name: 'u1' }]);
  });

  it('does not warn keptPreferred for a seated member with no preference', () => {
    const base: Selection = { mode: ROOMS, fullCottageParticipants: [], rooms: { B: [u('u1')] } };
    const ctx = ctxOf({ rooms: [room('A', 'A', 'SLOTS', 5), room('B', 'B', 'SLOTS', 5)], beds: [] });
    const { selection, warnings } = applyGroupToSelection(base, [member({ userId: 'u1' })], ctx);
    expect(selection.rooms.B?.length).toBe(1);
    expect(warnings).toHaveLength(0);
  });

  it('falls back to a free room when the preferred room is full from other bookings', () => {
    const ctx = ctxOf({
      rooms: [room('A', 'A', 'SLOTS', 1), room('B', 'B', 'SLOTS', 5)],
      beds: [],
      availability: [slotRoomAv('A', { capacity: 1, taken: 1 })], // A fully taken by others
    });
    const { selection, warnings } = applyGroupToSelection(
      { mode: ROOMS, fullCottageParticipants: [], rooms: {} },
      [member({ userId: 'u1', preferredRoomId: 'A' })],
      ctx,
    );
    expect(selection.rooms.A).toBeUndefined();
    expect(placedUsers(selection)).toEqual(['u1']);
    expect(selection.rooms.B?.length).toBe(1);
    expect(warnings).toContainEqual({ kind: 'preferredTaken', name: 'u1', roomName: 'B' });
  });

  it('drops a member when no room has space for the dates', () => {
    const ctx = ctxOf({
      rooms: [room('A', 'A', 'SLOTS', 1)],
      beds: [],
      availability: [slotRoomAv('A', { capacity: 1, taken: 1 })],
    });
    const { selection, warnings } = applyGroupToSelection(
      { mode: ROOMS, fullCottageParticipants: [], rooms: {} },
      [member({ userId: 'u1', preferredRoomId: 'A' })],
      ctx,
    );
    expect(placedUsers(selection)).toEqual([]);
    expect(warnings).toContainEqual({ kind: 'noSpace', name: 'u1' });
  });

  it('skips a member already booked elsewhere over these dates', () => {
    const ctx = ctxOf({
      rooms: [room('A', 'A', 'SLOTS')],
      beds: [],
      availability: [slotRoomAv('A', { takenBy: [occupant('u1')] })],
    });
    const { selection, warnings } = applyGroupToSelection(
      { mode: ROOMS, fullCottageParticipants: [], rooms: {} },
      [member({ userId: 'u1', preferredRoomId: 'A' })],
      ctx,
    );
    expect(placedUsers(selection)).toEqual([]);
    expect(warnings).toContainEqual({ kind: 'alreadyBooked', name: 'u1' });
  });

  it('places a member with no preference into the first free room', () => {
    const ctx = ctxOf({ rooms: [room('A', 'A', 'SLOTS'), room('B', 'B', 'SLOTS')], beds: [] });
    const { selection } = applyGroupToSelection(
      { mode: ROOMS, fullCottageParticipants: [], rooms: {} },
      [member({ userId: 'u1' })],
      ctx,
    );
    expect(selection.rooms.A?.length).toBe(1); // A sorts first
    expect(placedUsers(selection)).toEqual(['u1']);
  });

  it('selectionMoves reports only people who changed room/bed (not added/removed)', () => {
    const from: Selection = {
      mode: ROOMS,
      fullCottageParticipants: [],
      rooms: { A: [u('u1')], B: [u('u2')] },
    };
    const to: Selection = {
      mode: ROOMS,
      fullCottageParticipants: [],
      rooms: { B: [u('u1')], C: [u('u3')] }, // u1 moved A→B; u2 removed; u3 added
    };
    const moved = selectionMoves(from, to).map((p) => (p.kind === 'user' ? p.userId : ''));
    expect(moved).toEqual(['u1']);
  });

  it('selectionMoves is empty when placement is unchanged', () => {
    const sel: Selection = { mode: ROOMS, fullCottageParticipants: [], rooms: { A: [u('u1')] } };
    expect(selectionMoves(sel, sel)).toHaveLength(0);
  });

  it('does not mutate the base selection', () => {
    const base: Selection = { mode: ROOMS, fullCottageParticipants: [], rooms: { A: [u('u1')] } };
    const snapshot = JSON.parse(JSON.stringify(base));
    applyGroupToSelection(base, [member({ userId: 'u1', preferredRoomId: 'B' })], ctxOf({
      rooms: [room('A', 'A', 'SLOTS'), room('B', 'B', 'SLOTS')],
      beds: [],
    }));
    expect(base).toEqual(snapshot);
  });
});
