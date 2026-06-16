'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AvailabilityTarget, BedOccupancy, OccupantRef, PendingRef } from '@/lib/booking/types';
import { roomLabel } from '@/lib/booking/room-label';
import { formatStay } from '@/lib/booking/format-stay';
import { FullCottageShape, RoomIcon } from './RoomIcon';
import { PendingDot } from './PendingDot';
import { PersonBadge } from '@/components/PersonBadge';
import { BookedByMultiple } from './BookedByMultiple';
import { BookedUsersContext, collectBookedUserIds, useBookedUsers } from './booked-users';
import { SearchableSelect, type ComboOption } from './SearchableSelect';

export type BookingMode = 'FULL_COTTAGE' | 'ROOMS';

export interface PickerUser {
  id: string;
  name: string;
}

export interface PickerRoom {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  capacityMode: 'BEDS' | 'SLOTS';
  slotCount: number | null;
}

export interface PickerBed {
  id: string;
  roomId: string;
  kind: 'DOUBLE' | 'SINGLE';
  label: string;
}

/**
 * A single picked participant — either an existing user or a guest name.
 * `bedId` assigns the person to a specific bed in a BEDS-mode room (a double
 * holds up to two picks sharing the same `bedId`). Absent for whole-cottage
 * picks and SLOTS-mode rooms.
 */
export type ParticipantPick =
  | { kind: 'user'; userId: string; bedId?: string }
  | { kind: 'guest'; name: string; bedId?: string };

/**
 * Booking selection. Both fields are kept around regardless of which mode is
 * active so flipping back and forth doesn't lose the other view's state:
 *   - ROOMS → FULL_COTTAGE merges every room's participants into the cottage
 *     list (deduped); the room map stays untouched for later restore.
 *   - FULL_COTTAGE → ROOMS just switches modes; the room map is whatever it
 *     was before.
 */
export interface Selection {
  mode: 'FULL_COTTAGE' | 'ROOMS';
  fullCottageParticipants: ParticipantPick[];
  rooms: Record<string, ParticipantPick[]>;
}

interface Props {
  rooms: PickerRoom[];
  beds: PickerBed[];
  users: PickerUser[];
  availability: AvailabilityTarget[];
  value: Selection;
  onChange: (next: Selection) => void;
  currentUserId: string;
  /** Rendered directly below the whole-cottage/pick-areas toggle — used by the
   *  booking flow to place the group picker there. */
  belowModeToggle?: React.ReactNode;
}

/* ---------------- helpers ---------------- */

const GUEST_PREFIX = 'guest:';

function isFullAvailable(av: AvailabilityTarget[]) {
  const t = av.find((a) => a.kind === 'FULL_COTTAGE');
  return t?.kind === 'FULL_COTTAGE' ? t.available : true;
}

/**
 * Total pending requests overlapping the range, across the whole cottage —
 * sum of FULL_COTTAGE pending plus per-room pending. Used to flag the
 * whole-cottage option when *any* part of the cottage is currently
 * requested by someone else.
 */
function fullCottagePending(av: AvailabilityTarget[]): number {
  let total = 0;
  for (const a of av) {
    if (a.kind === 'FULL_COTTAGE') total += a.pending;
    else if (a.kind === 'SLOT_ROOM') total += a.pending;
  }
  return total;
}

/** Merge pending-requester lists, deduped by name + exact dates. */
function uniqPending(...lists: PendingRef[][]): PendingRef[] {
  const out: PendingRef[] = [];
  for (const ref of lists.flat()) {
    if (
      !out.some(
        (x) => x.name === ref.name && x.startDate === ref.startDate && x.endDate === ref.endDate,
      )
    ) {
      out.push(ref);
    }
  }
  return out;
}

/** Everyone with a pending request anywhere in the cottage (whole-cottage card). */
function fullCottagePendingParticipants(av: AvailabilityTarget[]): PendingRef[] {
  return uniqPending(
    ...av
      .filter((a) => a.kind === 'FULL_COTTAGE' || a.kind === 'SLOT_ROOM')
      .map((a) => a.pendingParticipants),
  );
}

function getRoomInfo(av: AvailabilityTarget[], roomId: string) {
  const t = av.find((a) => a.kind === 'SLOT_ROOM' && a.roomId === roomId);
  if (t?.kind !== 'SLOT_ROOM') {
    return {
      capacity: null as number | null,
      taken: 0,
      pending: 0,
      pendingParticipants: [] as PendingRef[],
      takenBy: [] as OccupantRef[],
    };
  }
  return {
    capacity: t.capacity,
    taken: t.taken,
    pending: t.pending,
    pendingParticipants: t.pendingParticipants,
    takenBy: t.takenBy,
  };
}

function bedSlotCapacity(beds: PickerBed[], roomId: string): number {
  return beds
    .filter((b) => b.roomId === roomId)
    .reduce((acc, b) => acc + (b.kind === 'DOUBLE' ? 2 : 1), 0);
}

/** Seats in a bed: a double sleeps two, a single one. */
function bedCapacity(kind: 'DOUBLE' | 'SINGLE'): number {
  return kind === 'DOUBLE' ? 2 : 1;
}

/** Per-bed occupancy (taken by others) for a room, from availability. */
function bedOccupancyOf(av: AvailabilityTarget[], roomId: string): BedOccupancy[] {
  const t = av.find((a) => a.kind === 'SLOT_ROOM' && a.roomId === roomId);
  return t?.kind === 'SLOT_ROOM' ? t.beds : [];
}

function collectUsedUserIds(selection: Selection): Set<string> {
  const ids = new Set<string>();
  const add = (list: ParticipantPick[]) => {
    for (const p of list) if (p.kind === 'user') ids.add(p.userId);
  };
  if (selection.mode === 'FULL_COTTAGE') add(selection.fullCottageParticipants);
  else for (const list of Object.values(selection.rooms)) add(list);
  return ids;
}

/** Walk the rooms map and return one ParticipantPick per unique user (or
 *  one row per guest, since guests aren't deduped). Used when promoting a
 *  ROOMS draft into FULL_COTTAGE on mode switch. */
function flattenRoomParticipants(rooms: Record<string, ParticipantPick[]>): ParticipantPick[] {
  const seenUsers = new Set<string>();
  const out: ParticipantPick[] = [];
  for (const list of Object.values(rooms)) {
    for (const p of list) {
      if (p.kind === 'user') {
        if (seenUsers.has(p.userId)) continue;
        seenUsers.add(p.userId);
      }
      out.push(p);
    }
  }
  return out;
}

/** Merge two participant lists — registered users dedup by id (the *first*
 *  occurrence wins so existing assignments aren't disturbed); guests append. */
function mergeParticipants(
  a: ParticipantPick[],
  b: ParticipantPick[],
): ParticipantPick[] {
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

function userIdsIn(list: ParticipantPick[]): Set<string> {
  const ids = new Set<string>();
  for (const p of list) if (p.kind === 'user') ids.add(p.userId);
  return ids;
}

/** Remove duplicate user picks from a single list — the *latest* occurrence
 *  wins (matches the user-just-picked-themselves intent). Guests are never
 *  considered duplicates. */
function dedupKeepLatest(list: ParticipantPick[]): ParticipantPick[] {
  const seen = new Set<string>();
  const out: ParticipantPick[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    if (p.kind === 'user') {
      if (seen.has(p.userId)) continue;
      seen.add(p.userId);
    }
    out.unshift(p);
  }
  return out;
}

/** Pick a sensible default participant for a freshly-checked room — first
 *  registered user that isn't already booked elsewhere, otherwise an empty
 *  guest slot the user can fill in. */
function defaultPickFor(
  users: PickerUser[],
  alreadyUsed: Set<string>,
  preferredUserId: string,
): ParticipantPick {
  if (!alreadyUsed.has(preferredUserId)) {
    return { kind: 'user', userId: preferredUserId };
  }
  const free = users.find((u) => !alreadyUsed.has(u.id));
  if (free) return { kind: 'user', userId: free.id };
  return { kind: 'guest', name: '' };
}

/** Returns options for the SearchableSelect. Every registered user is shown
 *  so the user can pick themselves in a different room — `setRoomList` will
 *  strip them from the previous room automatically. */
function buildOptions(users: PickerUser[]): ComboOption[] {
  return users.map((u) => ({ id: u.id, name: u.name }));
}

/** Encode/decode the SearchableSelect value so it can carry user ids OR
 *  guest-name sentinel values. */
function encodePick(p: ParticipantPick): string {
  return p.kind === 'user' ? p.userId : `${GUEST_PREFIX}${p.name}`;
}
function decodePick(value: string): ParticipantPick | null {
  if (!value) return null;
  if (value.startsWith(GUEST_PREFIX)) return { kind: 'guest', name: value.slice(GUEST_PREFIX.length) };
  return { kind: 'user', userId: value };
}

/* ---------------- main component ---------------- */

export function RoomBedPicker({
  rooms,
  beds,
  users,
  availability,
  value,
  onChange,
  currentUserId,
  belowModeToggle,
}: Props) {
  const t = useTranslations('Book');
  const locale = useLocale();
  const orderedRooms = [...rooms].sort((a, b) =>
    roomLabel(a, locale).localeCompare(roomLabel(b, locale)),
  );

  // People already booked (CONFIRMED) over these dates can't be added again.
  const bookedIds = React.useMemo(() => collectBookedUserIds(availability), [availability]);

  const fullAvailable = availability.length === 0 || isFullAvailable(availability);
  const fullPending = fullCottagePending(availability);
  const fullPendingParticipants = fullCottagePendingParticipants(availability);
  const availableModes: BookingMode[] = fullAvailable
    ? ['FULL_COTTAGE', 'ROOMS']
    : ['ROOMS'];

  React.useEffect(() => {
    if (value.mode === 'FULL_COTTAGE' && !fullAvailable) {
      onChange({ ...value, mode: 'ROOMS' });
    }
  }, [fullAvailable, value, onChange]);

  const setMode = (mode: BookingMode) => {
    if (mode === value.mode) return;
    if (mode === 'FULL_COTTAGE') {
      // Promote room participants into the cottage list, but keep the room
      // map intact so flipping back restores the ROOMS view.
      const fromRooms = flattenRoomParticipants(value.rooms);
      const next = mergeParticipants(value.fullCottageParticipants, fromRooms);
      onChange({
        ...value,
        mode: 'FULL_COTTAGE',
        fullCottageParticipants:
          next.length > 0 ? next : [defaultPickFor(users, bookedIds, currentUserId)],
      });
    } else {
      // Switching back to ROOMS just changes the active mode — both stores
      // were preserved across the prior switch.
      onChange({ ...value, mode: 'ROOMS' });
    }
  };

  /**
   * Apply a per-room change and immediately strip any user that the new
   * `next` list claims from every other room. A registered user can only
   * sleep in one place at a time, so picking yourself in room B silently
   * removes you from room A. Within a single list we keep the *latest*
   * occurrence.
   */
  const setRoomList = (roomId: string, next: ParticipantPick[] | null) => {
    const rooms = { ...value.rooms };
    if (!next || next.length === 0) {
      delete rooms[roomId];
    } else {
      const dedupedSelf = dedupKeepLatest(next);
      rooms[roomId] = dedupedSelf;
      const newUsers = userIdsIn(dedupedSelf);
      for (const otherRoomId of Object.keys(rooms)) {
        if (otherRoomId === roomId) continue;
        const filtered = rooms[otherRoomId]!.filter(
          (p) => !(p.kind === 'user' && newUsers.has(p.userId)),
        );
        if (filtered.length === 0) delete rooms[otherRoomId];
        else rooms[otherRoomId] = filtered;
      }
    }
    onChange({ ...value, rooms });
  };

  const setFullCottage = (next: ParticipantPick[]) => {
    onChange({ ...value, fullCottageParticipants: dedupKeepLatest(next) });
  };

  /**
   * Move a single participant from one room to another (drag and drop).
   * Source room shrinks (removed if it ends up empty); target room appends
   * the moved person, then we apply the standard cross-room dedup so a user
   * never ends up in two rooms.
   */
  const moveParticipant = (
    sourceRoomId: string,
    sourceIndex: number,
    targetRoomId: string,
  ) => {
    if (sourceRoomId === targetRoomId) return;
    const sourceList = value.rooms[sourceRoomId];
    if (!sourceList) return;
    const moving = sourceList[sourceIndex];
    if (!moving) return;

    const newRooms = { ...value.rooms };
    const newSource = sourceList.filter((_, i) => i !== sourceIndex);
    if (newSource.length === 0) delete newRooms[sourceRoomId];
    else newRooms[sourceRoomId] = newSource;

    const targetList = newRooms[targetRoomId] ?? [];
    newRooms[targetRoomId] = dedupKeepLatest([...targetList, moving]);

    if (moving.kind === 'user') {
      for (const id of Object.keys(newRooms)) {
        if (id === targetRoomId) continue;
        const filtered = newRooms[id]!.filter(
          (p) => !(p.kind === 'user' && p.userId === moving.userId),
        );
        if (filtered.length === 0) delete newRooms[id];
        else newRooms[id] = filtered;
      }
    }
    onChange({ ...value, rooms: newRooms });
  };

  /** Add a default participant to a specific bed's next free seat. */
  const addToBed = (roomId: string, bedId: string) => {
    const used = new Set([...collectUsedUserIds(value), ...bookedIds]);
    const pick: ParticipantPick = { ...defaultPickFor(users, used, currentUserId), bedId };
    setRoomList(roomId, [...(value.rooms[roomId] ?? []), pick]);
  };

  /** Replace the participant at `index` in a room, keeping its bed. */
  const updateOccupant = (roomId: string, index: number, np: ParticipantPick) => {
    const list = [...(value.rooms[roomId] ?? [])];
    const prev = list[index];
    if (!prev) return;
    list[index] = { ...np, bedId: prev.bedId };
    setRoomList(roomId, list);
  };

  const removeOccupant = (roomId: string, index: number) => {
    const list = (value.rooms[roomId] ?? []).filter((_, i) => i !== index);
    setRoomList(roomId, list.length ? list : null);
  };

  // Park any bed-room participant that lacks a valid bed (group preset / mode
  // flip, or a bed that just became taken) into the next free bed so it shows
  // and submits as a BED row.
  React.useEffect(() => {
    let changed = false;
    const newRooms: Record<string, ParticipantPick[]> = { ...value.rooms };
    for (const room of rooms) {
      if (room.capacityMode !== 'BEDS') continue;
      const list = value.rooms[room.id];
      if (!list || list.length === 0) continue;
      const roomBeds = beds.filter((b) => b.roomId === room.id);
      const occByBed = new Map(
        bedOccupancyOf(availability, room.id).map((b) => [b.bedId, b] as const),
      );
      // Seats on a bed available to me = capacity − others' peak.
      const freeOf = (b: PickerBed) => {
        const occ = occByBed.get(b.id);
        return occ ? Math.max(0, occ.capacity - occ.takenByOthers) : bedCapacity(b.kind);
      };
      const counts = new Map<string, number>();
      const next = list.map((p) => ({ ...p }));
      for (const p of next) {
        const bed = p.bedId ? roomBeds.find((b) => b.id === p.bedId) : undefined;
        if (p.bedId && (!bed || freeOf(bed) === 0)) p.bedId = undefined;
      }
      for (const p of next) if (p.bedId) counts.set(p.bedId, (counts.get(p.bedId) ?? 0) + 1);
      for (const p of next) {
        if (p.bedId) continue;
        const free = roomBeds.find((b) => (counts.get(b.id) ?? 0) < freeOf(b));
        if (free) {
          p.bedId = free.id;
          counts.set(free.id, (counts.get(free.id) ?? 0) + 1);
        }
      }
      if (next.some((p, i) => p.bedId !== list[i]!.bedId)) {
        newRooms[room.id] = next;
        changed = true;
      }
    }
    if (changed) onChange({ ...value, rooms: newRooms });
  }, [value, rooms, beds, availability, onChange]);

  // Treat already-booked people as "used" too, so we never default to adding
  // someone who can't be booked over these dates.
  const usedUserIds = new Set([...collectUsedUserIds(value), ...bookedIds]);

  return (
    <BookedUsersContext.Provider value={bookedIds}>
    <div className="flex flex-col gap-5">
      <ModeToggle
        value={value.mode}
        onChange={setMode}
        modes={availableModes}
        labels={{
          FULL_COTTAGE: t('modeWholeCottage'),
          ROOMS: t('modeRooms'),
        }}
      />

      {belowModeToggle}

      {value.mode === 'FULL_COTTAGE' && (
        <div
          className={cn(
            'rounded-xl border bg-[var(--card)] p-5',
            fullPending > 0
              ? 'border-dashed border-[var(--color-partial)]/70 bg-[color-mix(in_oklch,var(--card),var(--color-partial)_6%)]'
              : 'border-[var(--border)]',
          )}
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-1 inline-flex shrink-0 items-center">
              <FullCottageShape size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{t('fullCottage')}</h2>
                <PendingDot participants={fullPendingParticipants} />
              </div>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {fullAvailable ? t('fullCottageDescription') : t('fullCottageBlocked')}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <ParticipantList
              participants={value.fullCottageParticipants}
              users={users}
              usedUserIds={usedUserIds}
              currentUserId={currentUserId}
              onChange={setFullCottage}
              capacity={null}
              labelPrefix={t('participantLabel')}
            />
          </div>
        </div>
      )}

      {value.mode === 'ROOMS' && (
        <div className="grid grid-cols-1 gap-3">
          {orderedRooms.map((room) => {
            // BEDS-mode rooms are booked per bed — assign a person to each bed.
            if (room.capacityMode === 'BEDS') {
              return (
                <BedRoomCard
                  key={room.id}
                  roomId={room.id}
                  label={roomLabel(room, locale)}
                  icon={<RoomIcon name={room.icon} size={14} color={room.color} />}
                  beds={beds.filter((b) => b.roomId === room.id)}
                  occupancy={bedOccupancyOf(availability, room.id)}
                  othersPeak={getRoomInfo(availability, room.id).taken}
                  picks={value.rooms[room.id] ?? []}
                  users={users}
                  onAddToBed={addToBed}
                  onUpdateOccupant={(i, p) => updateOccupant(room.id, i, p)}
                  onRemoveOccupant={(i) => removeOccupant(room.id, i)}
                />
              );
            }

            // SLOTS-mode rooms (e.g. the garden) keep the capacity/people model.
            const info = getRoomInfo(availability, room.id);
            const capacity = info.capacity ?? room.slotCount;
            const taken = info.taken;
            const pending = info.pending;
            const remaining =
              capacity == null ? Number.POSITIVE_INFINITY : Math.max(0, capacity - taken);
            const list = value.rooms[room.id] ?? [];
            const checked = list.length > 0;
            const available = remaining > 0;
            // Pending requests don't reduce capacity — others can request the
            // same slot in parallel and a manager picks. Confirmed bookings
            // still cap how many you may add.
            const acceptsDrops =
              capacity == null || list.length < (capacity - taken);

            return (
              <RoomCard
                key={room.id}
                icon={<RoomIcon name={room.icon} size={14} color={room.color} />}
                label={roomLabel(room, locale)}
                pendingParticipants={info.pendingParticipants}
                meta={
                  capacity == null
                    ? t('slotsUsedUnlimited', { count: list.length + taken })
                    : t('slotsUsed', {
                        // Count slots others have already booked, not just the
                        // picks being added now — a reserved room shows e.g. 1/2.
                        used: list.length + taken,
                        total: capacity,
                      })
                }
                available={available}
                checked={checked}
                roomId={room.id}
                acceptsDrops={acceptsDrops}
              >
                {info.takenBy.length > 0 && (
                  // Slots already held by others — greyed box (muted bg, no
                  // opacity so the tooltips stay crisp). One person → badge;
                  // several distinct people → a "multiple people" label whose
                  // tooltip lists who and when (e.g. two back-to-back stays).
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-2">
                    {new Set(info.takenBy.map((o) => o.name)).size > 1 ? (
                      <BookedByMultiple occupants={info.takenBy} />
                    ) : (
                      <PersonBadge
                        name={info.takenBy[0]!.name}
                        isGuest={info.takenBy[0]!.isGuest}
                        isAdmin={info.takenBy[0]!.isAdmin}
                        isManager={info.takenBy[0]!.isManager}
                        when={formatStay(info.takenBy[0]!, locale)}
                      />
                    )}
                  </div>
                )}
                <ParticipantList
                  participants={list}
                  users={users}
                  usedUserIds={usedUserIds}
                  currentUserId={currentUserId}
                  onChange={(next) => setRoomList(room.id, next)}
                  capacity={capacity == null ? null : Math.max(0, capacity - taken)}
                  labelPrefix={t('participantLabel')}
                  dragSourceRoomId={room.id}
                  boxed
                />
              </RoomCard>
            );
          })}
        </div>
      )}
    </div>
    </BookedUsersContext.Provider>
  );
}

/* ---------------- subcomponents ---------------- */

function ParticipantList({
  participants,
  users,
  usedUserIds,
  currentUserId,
  onChange,
  capacity,
  labelPrefix,
  showBedHint,
  bedHint,
  dragSourceRoomId,
  boxed,
}: {
  participants: ParticipantPick[];
  users: PickerUser[];
  usedUserIds: Set<string>;
  currentUserId: string;
  onChange: (next: ParticipantPick[]) => void;
  capacity: number | null;
  labelPrefix: string;
  showBedHint?: boolean;
  bedHint?: string;
  /** Identifies this list as a drag-source (from this room id). When unset
   *  the rows aren't draggable. */
  dragSourceRoomId?: string;
  /** Capacity rooms: wrap each participant — and the add control — in its own
   *  bordered box (one slot per box), like the beds. */
  boxed?: boolean;
}) {
  const t = useTranslations('Book');
  const canAdd = capacity == null || participants.length < capacity;

  const updateAt = (i: number, p: ParticipantPick) => {
    const next = [...participants];
    next[i] = p;
    onChange(next);
  };
  const removeAt = (i: number) => {
    onChange(participants.filter((_, j) => j !== i));
  };
  const addOne = () => {
    // Treat both the booking-wide used set AND this list's existing picks as
    // already-used, so we never default to a duplicate.
    const used = new Set(usedUserIds);
    for (const p of participants) if (p.kind === 'user') used.add(p.userId);
    onChange([...participants, defaultPickFor(users, used, currentUserId)]);
  };

  return (
    <div className="flex flex-col gap-2">
      {showBedHint && bedHint && (
        <p className="text-xs text-[var(--muted-foreground)]">{bedHint}</p>
      )}
      {participants.map((p, i) => {
        const row = (
          <ParticipantRow
            index={i}
            pick={p}
            label={`${labelPrefix} ${i + 1}`}
            users={users}
            showRemove={participants.length > 1}
            onChange={(next) => updateAt(i, next)}
            onRemove={() => removeAt(i)}
            dragSourceRoomId={dragSourceRoomId}
            removeLabel={t('removeParticipant')}
            dragHandleLabel={t('dragParticipant')}
          />
        );
        return boxed ? (
          <div key={i} className="rounded-lg border border-[var(--border)] p-2">
            {row}
          </div>
        ) : (
          <React.Fragment key={i}>{row}</React.Fragment>
        );
      })}
      {canAdd &&
        (boxed && participants.length === 0 ? (
          <button
            type="button"
            onClick={addOne}
            className="flex w-full items-center rounded-lg border border-[var(--border)] p-2 text-left transition-colors active:bg-[var(--muted)]/50"
          >
            <span className="pointer-events-none rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
              <Plus className="mr-1 inline size-3" /> {t('bedSeatAdd')}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={addOne}
            className={cn(
              'rounded-md border border-dashed border-[var(--border)] bg-transparent text-xs text-[var(--muted-foreground)] transition-colors active:bg-[var(--muted)]',
              // Capacity: a full-width clickable slot box. Otherwise a compact pill.
              boxed ? 'flex w-full items-center px-3 py-2' : 'self-start px-2 py-1',
            )}
          >
            <Plus className="mr-1 inline size-3" /> {t('bedSeatAdd')}
          </button>
        ))}
    </div>
  );
}

function ParticipantRow({
  index,
  pick,
  label,
  users,
  showRemove,
  onChange,
  onRemove,
  dragSourceRoomId,
  removeLabel,
  dragHandleLabel,
}: {
  index: number;
  pick: ParticipantPick;
  label: string;
  users: PickerUser[];
  showRemove: boolean;
  onChange: (next: ParticipantPick) => void;
  onRemove: () => void;
  dragSourceRoomId?: string;
  removeLabel: string;
  dragHandleLabel: string;
}) {
  // Mobile drops the drag-and-drop reassignment in favour of the dropdown
  // (less janky on touch screens, more accessible). `dragSourceRoomId` and
  // `dragHandleLabel` are accepted for prop-shape parity with the desktop
  // variant but ignored here.
  void dragSourceRoomId;
  void dragHandleLabel;

  return (
    <div className="flex items-end gap-2 rounded-md">
      <div className="flex-1">
        <ParticipantPicker label={label} users={users} value={pick} onChange={onChange} />
      </div>
      {showRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="mb-px inline-flex size-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-sm hover:bg-[var(--muted)]"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function ParticipantPicker({
  label,
  users,
  value,
  onChange,
}: {
  label: string;
  users: PickerUser[];
  value: ParticipantPick;
  onChange: (p: ParticipantPick) => void;
}) {
  const t = useTranslations('Book');
  const encoded = encodePick(value);
  const booked = useBookedUsers();
  // Drop people already booked over these dates — but never hide the currently
  // selected option, so the field can still render its value.
  const options = buildOptions(users).filter((o) => !booked.has(o.id) || o.id === encoded);

  return (
    <SearchableSelect
      label={label}
      options={options}
      value={encoded}
      editText={value.kind === 'guest' ? value.name : undefined}
      placeholder={value.kind === 'guest' ? value.name || t('guestPlaceholder') : undefined}
      onChange={(raw) => {
        const decoded = decodePick(raw);
        if (decoded) onChange(decoded);
      }}
      allowCustom={(query) => {
        const trimmed = query.trim();
        if (!trimmed) return null;
        // Typed text matching a (bookable) registered user prefers that user;
        // a name that's already booked falls through to a free-text guest.
        const match = users.find(
          (u) => u.name.toLowerCase() === trimmed.toLowerCase() && !booked.has(u.id),
        );
        if (match) return match.id;
        return `${GUEST_PREFIX}${trimmed}`;
      }}
    />
  );
}

function ModeToggle({
  value,
  onChange,
  modes,
  labels,
}: {
  value: BookingMode;
  onChange: (m: BookingMode) => void;
  modes: BookingMode[];
  labels: Record<BookingMode, string>;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 sm:w-fit"
    >
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none',
            value === mode
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
          )}
        >
          {labels[mode]}
        </button>
      ))}
    </div>
  );
}

function RoomCard({
  icon,
  label,
  meta,
  available,
  checked,
  roomId,
  acceptsDrops,
  pendingParticipants,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  available: boolean;
  checked: boolean;
  roomId: string;
  acceptsDrops: boolean;
  pendingParticipants: PendingRef[];
  children?: React.ReactNode;
}) {
  // No drop targets on mobile — `roomId` and `acceptsDrops` are accepted for
  // prop-shape parity with the desktop variant but ignored here.
  void roomId;
  void acceptsDrops;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-[var(--card)] p-4 transition-colors',
        checked
          ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30'
          : pendingParticipants.length > 0
            ? 'border-dashed border-[var(--color-partial)]/70 bg-[color-mix(in_oklch,var(--card),var(--color-partial)_6%)]'
            : 'border-[var(--border)]',
        !available && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex shrink-0 items-center">
          {icon}
        </span>
        <span className="text-sm font-medium">{label}</span>
        <PendingDot participants={pendingParticipants} />
        {meta && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ---------------- bed-mode room (touch: dropdown seats, no drag) ---------------- */

function BedRoomCard({
  roomId,
  label,
  icon,
  beds,
  occupancy,
  othersPeak,
  picks,
  users,
  onAddToBed,
  onUpdateOccupant,
  onRemoveOccupant,
}: {
  roomId: string;
  label: string;
  icon: React.ReactNode;
  beds: PickerBed[];
  occupancy: BedOccupancy[];
  /** Peak concurrent people others hold in this room on any single day. */
  othersPeak: number;
  picks: ParticipantPick[];
  users: PickerUser[];
  onAddToBed: (roomId: string, bedId: string) => void;
  onUpdateOccupant: (index: number, pick: ParticipantPick) => void;
  onRemoveOccupant: (index: number) => void;
}) {
  const t = useTranslations('Book');
  const takenMap = new Map(occupancy.map((b) => [b.bedId, b] as const));
  const roomPendingParticipants = uniqPending(...occupancy.map((b) => b.pendingParticipants));
  const orderedBeds = [...beds].sort((a, b) =>
    a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'DOUBLE' ? -1 : 1,
  );
  const totalSeats = beds.reduce((n, b) => n + bedCapacity(b.kind), 0);
  const indexed = picks.map((p, i) => ({ p, i }));
  const assigned = picks.length;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-[var(--card)] p-4 transition-colors',
        assigned > 0
          ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30'
          : 'border-[var(--border)]',
        // No card-level `opacity` for a fully-taken room: it would fade the
        // occupant badges' tooltips. The muted bed boxes already convey "taken".
      )}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex shrink-0 items-center">
          {icon}
        </span>
        <span className="text-sm font-medium">{label}</span>
        <PendingDot participants={roomPendingParticipants} />
        <span className="ml-auto text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
          {/* Peak concurrent people: others' peak + your picks (all span the
              range). Back-to-back stays don't double-count. */}
          {t('slotsUsed', { used: assigned + othersPeak, total: totalSeats })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {orderedBeds.map((bed) => (
          <BedBox
            key={bed.id}
            bed={bed}
            capacity={takenMap.get(bed.id)?.capacity ?? bedCapacity(bed.kind)}
            takenByOthers={takenMap.get(bed.id)?.takenByOthers ?? 0}
            takenBy={takenMap.get(bed.id)?.takenBy ?? []}
            pendingParticipants={takenMap.get(bed.id)?.pendingParticipants ?? []}
            occupants={indexed.filter((x) => x.p.bedId === bed.id)}
            users={users}
            onAdd={() => onAddToBed(roomId, bed.id)}
            onUpdate={onUpdateOccupant}
            onRemove={onRemoveOccupant}
          />
        ))}
      </div>
    </div>
  );
}

function BedBox({
  bed,
  capacity,
  takenByOthers,
  takenBy,
  pendingParticipants,
  occupants,
  users,
  onAdd,
  onUpdate,
  onRemove,
}: {
  bed: PickerBed;
  capacity: number;
  takenByOthers: number;
  takenBy: OccupantRef[];
  pendingParticipants: PendingRef[];
  occupants: { p: ParticipantPick; i: number }[];
  users: PickerUser[];
  onAdd: () => void;
  onUpdate: (index: number, pick: ParticipantPick) => void;
  onRemove: (index: number) => void;
}) {
  const t = useTranslations('Book');
  const locale = useLocale();
  const bedName = bed.kind === 'DOUBLE' ? t('bedDouble') : t('bedSingle');
  // Seats free for me = capacity − others' peak. Doubles are shareable.
  const freeForMe = Math.max(0, capacity - takenByOthers);
  const hasOthers = takenBy.length > 0;
  const canAdd = occupants.length < freeForMe;
  const empty = !hasOthers && occupants.length === 0 && freeForMe > 0;
  const onlyOthers = hasOthers && occupants.length === 0 && freeForMe === 0;

  const othersBadge = hasOthers ? (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--muted)]/50 px-1.5 py-1">
      {new Set(takenBy.map((o) => o.name)).size > 1 ? (
        <BookedByMultiple occupants={takenBy} />
      ) : (
        <PersonBadge
          name={takenBy[0]!.name}
          isGuest={takenBy[0]!.isGuest}
          isAdmin={takenBy[0]!.isAdmin}
          isManager={takenBy[0]!.isManager}
          when={formatStay(takenBy[0]!, locale)}
        />
      )}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">{bedName}</span>
        <PendingDot participants={pendingParticipants} />
      </div>
      {empty ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center rounded-lg border border-[var(--border)] p-2 text-left transition-colors active:bg-[var(--muted)]/50"
        >
          <span className="pointer-events-none rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
            <Plus className="mr-1 inline size-3" /> {t('bedSeatAdd')}
          </span>
        </button>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-2 rounded-lg border p-2',
            onlyOthers
              ? 'border-[var(--border)] bg-[var(--muted)]/40'
              : 'border-[var(--border)]',
          )}
        >
          {hasOthers && othersBadge}
          {occupants.map(({ p, i }) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <ParticipantPicker
                  label={t('participantLabel')}
                  users={users}
                  value={p}
                  onChange={(np) => onUpdate(i, np)}
                />
              </div>
              <button
                type="button"
                aria-label={t('removeParticipant')}
                onClick={() => onRemove(i)}
                className="mb-px inline-flex size-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-sm hover:bg-[var(--muted)]"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="self-start rounded-md border border-dashed border-[var(--border)] bg-transparent px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              <Plus className="mr-1 inline size-3" /> {t('bedSeatAdd')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
