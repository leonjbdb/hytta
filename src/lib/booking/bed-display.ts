import type { BedKind } from '@/db/schema';

export interface BedLike {
  id: string;
  kind: BedKind;
  roomId: string;
  /** Opaque storage label — not shown to users, not used for numbering. */
  label?: string;
}

/**
 * Friendly bed name in the active locale. Bed labels are opaque (random
 * suffixes such as `SINGLE-a3f9bc30`), so they carry no meaningful index —
 * beds are numbered by their position amongst same-kind siblings in the same
 * room: "Single bed 1", "Single bed 2". A bed that is the only one of its kind
 * in its room drops the index entirely ("Single bed").
 */
export function bedDisplayName(
  kind: BedKind,
  t: (key: 'bedDouble' | 'bedSingle') => string,
  ctx: { allBedsInRoom: BedLike[]; bedId: string },
): string {
  const base = t(kind === 'DOUBLE' ? 'bedDouble' : 'bedSingle');
  const sameKind = ctx.allBedsInRoom
    .filter((b) => b.kind === kind)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (sameKind.length <= 1) return base;
  const idx = sameKind.findIndex((b) => b.id === ctx.bedId);
  return idx >= 0 ? `${base} ${idx + 1}` : base;
}

/**
 * Convenience wrapper that builds the sibling context from a flat list of all
 * beds. Looks up the booked bed's room, then numbers it amongst that room's
 * beds. Falls back to the bare base name when the bed isn't in the list.
 */
export function bedDisplayNameInRoom(
  kind: BedKind,
  bedId: string,
  allBeds: BedLike[],
  t: (key: 'bedDouble' | 'bedSingle') => string,
): string {
  const roomId = allBeds.find((b) => b.id === bedId)?.roomId;
  const allBedsInRoom = roomId ? allBeds.filter((b) => b.roomId === roomId) : [];
  return bedDisplayName(kind, t, { allBedsInRoom, bedId });
}
