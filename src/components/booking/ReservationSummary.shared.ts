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
  error: string | null;
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

export function describeSelection(
  selection: Selection,
  rooms: PickerRoom[],
  users: PickerUser[],
  fullLabel: string,
  locale: string,
): string {
  if (selection.mode === 'FULL_COTTAGE') {
    if (selection.fullCottageParticipants.length === 0) return fullLabel;
    return `${fullLabel} · ${selection.fullCottageParticipants
      .map((p) => labelForPick(p, users))
      .join(', ')}`;
  }

  const parts: string[] = [];
  for (const [roomId, list] of Object.entries(selection.rooms)) {
    const room = rooms.find((r) => r.id === roomId);
    const label = room ? roomLabel(room, locale) : '?';
    parts.push(`${label} → ${list.map((p) => labelForPick(p, users)).join(', ')}`);
  }
  return parts.join(' · ');
}
