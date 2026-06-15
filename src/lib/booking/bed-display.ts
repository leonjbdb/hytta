import type { BedKind } from '@/db/schema';

interface BedLike {
  id: string;
  kind: BedKind;
  label: string;
  roomId: string;
}

/**
 * Friendly bed name in the active locale. Beds are auto-labelled with opaque
 * suffixes (e.g. UUID slugs) so we number them based on their position
 * amongst siblings of the same kind in the same room — "Single bed 1",
 * "Single bed 2", etc. A solo bed of its kind drops the index entirely.
 */
export function bedDisplayName(
  kind: BedKind,
  label: string,
  t: (key: 'bedDouble' | 'bedSingle') => string,
  ctx?: { allBedsInRoom: BedLike[]; bedId: string },
): string {
  const baseKey = kind === 'DOUBLE' ? 'bedDouble' : 'bedSingle';
  const base = t(baseKey);

  if (ctx) {
    const sameKind = [...ctx.allBedsInRoom]
      .filter((b) => b.kind === kind)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (sameKind.length <= 1) return base;
    const idx = sameKind.findIndex((b) => b.id === ctx.bedId);
    return idx >= 0 ? `${base} ${idx + 1}` : base;
  }

  // Legacy path: extract trailing digit from label (works for the seeded
  // RED-SINGLE-1 / RED-SINGLE-2 style ids).
  if (kind === 'DOUBLE') return base;
  const tail = label.match(/(\d+)$/)?.[1];
  return tail ? `${base} ${tail}` : base;
}
