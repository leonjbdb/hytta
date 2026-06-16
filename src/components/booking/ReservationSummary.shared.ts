import { roomLabel } from '@/lib/booking/room-label';
import type { ParticipantPick, PickerRoom, PickerUser, Selection } from './RoomBedPicker.desktop';

export interface ReservationSummaryProps {
  startDate: string | undefined;
  endDate: string | undefined;
  selection: Selection;
  rooms: PickerRoom[];
  beds: PickerBedRef[];
  users: PickerUser[];
  isPending: boolean;
  onConfirm: () => void;
  /** Overrides the submit button label (e.g. "Save changes" when editing). */
  submitLabel?: string;
}

/** Minimal bed shape required by the summary — keeps imports stable. */
export interface PickerBedRef {
  id: string;
  roomId: string;
  kind: 'DOUBLE' | 'SINGLE';
  label: string;
}

export function targetCount(selection: Selection): number {
  if (selection.mode === 'FULL_COTTAGE') return selection.fullCottageParticipants.length;
  let n = 0;
  for (const list of Object.values(selection.rooms)) n += list.length;
  return n;
}

const labelForPick = (
  p: ParticipantPick,
  users: PickerUser[],
): string =>
  p.kind === 'user'
    ? users.find((u) => u.id === p.userId)?.name ?? '—'
    : p.name || '?';

/** A bed (or unassigned slot) inside a room, with the people picked for it. */
export interface SummaryBedGroup {
  /** Bed id, or `null` for SLOTS-mode rooms / the whole-cottage list. */
  bedId: string | null;
  people: string[];
}

/** One room (or the whole cottage) and everyone staying in it. */
export interface SummaryGroup {
  key: string;
  label: string;
  /** Room icon name, or `null` for the whole-cottage group. */
  icon: string | null;
  color: string | null;
  beds: SummaryBedGroup[];
  peopleCount: number;
}

/**
 * Fully expanded view of a selection — every room, bed and person — used by the
 * confirm-booking summary's accordion. The collapsed line is built from the
 * counts; the open panel walks `groups`.
 */
export interface SummaryModel {
  mode: 'FULL_COTTAGE' | 'ROOMS';
  roomCount: number;
  peopleCount: number;
  groups: SummaryGroup[];
}

export function buildSummaryModel(
  selection: Selection,
  rooms: PickerRoom[],
  users: PickerUser[],
  fullLabel: string,
  locale: string,
): SummaryModel {
  if (selection.mode === 'FULL_COTTAGE') {
    const people = selection.fullCottageParticipants.map((p) => labelForPick(p, users));
    return {
      mode: 'FULL_COTTAGE',
      roomCount: 0,
      peopleCount: people.length,
      groups:
        people.length === 0
          ? []
          : [
              {
                key: 'full',
                label: fullLabel,
                icon: null,
                color: null,
                peopleCount: people.length,
                beds: [{ bedId: null, people }],
              },
            ],
    };
  }

  const groups: SummaryGroup[] = [];
  let peopleCount = 0;
  for (const [roomId, list] of Object.entries(selection.rooms)) {
    if (list.length === 0) continue;
    const room = rooms.find((r) => r.id === roomId);
    peopleCount += list.length;

    // Group picks by bed, preserving the order beds first appear.
    const order: (string | null)[] = [];
    const byBed = new Map<string | null, string[]>();
    for (const p of list) {
      const key = p.bedId ?? null;
      if (!byBed.has(key)) {
        byBed.set(key, []);
        order.push(key);
      }
      byBed.get(key)!.push(labelForPick(p, users));
    }

    const beds: SummaryBedGroup[] = order.map((bedId) => ({
      bedId,
      people: byBed.get(bedId)!,
    }));

    groups.push({
      key: roomId,
      label: room ? roomLabel(room, locale) : '?',
      icon: room?.icon ?? null,
      color: room?.color ?? null,
      beds,
      peopleCount: list.length,
    });
  }
  return { mode: 'ROOMS', roomCount: groups.length, peopleCount, groups };
}
