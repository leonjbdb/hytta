import type { BedKind } from '@/db/schema';
import {
  detectRequestConflicts,
  type ConflictReason,
} from '@/lib/booking/request-conflicts';

export interface RequestRow {
  rowId: string;
  bookingId: string | null;
  participantId: string | null;
  participantName: string | null;
  participantEmail: string | null;
  participantIsAdmin: boolean | null;
  participantIsManager: boolean | null;
  guestName: string | null;
  bookerId: string | null;
  bookerName: string | null;
  bookerEmail: string | null;
  targetKind: 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT';
  /** Reservation's room (ROOM/SLOT targets). */
  roomId: string | null;
  /** Reservation's bed (BED targets). */
  bedId: string | null;
  /** Parent room of `bedId` — lets BED targets map onto a room for conflicts. */
  bedRoomId: string | null;
  roomNameNb: string | null;
  roomNameEn: string | null;
  roomIcon: string | null;
  roomColor: string | null;
  bedLabel: string | null;
  bedKind: BedKind | null;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  createdAt: number;
}

export interface RequestGroup {
  bookingId: string;
  startDate: string;
  endDate: string;
  bookerId: string | null;
  bookerName: string | null;
  createdAt: number;
  rows: RequestRow[];
}

/** Group request rows by bookingId, ordered by submission time. */
export function groupRequests(rs: RequestRow[]): RequestGroup[] {
  const byKey = new Map<string, RequestGroup>();
  for (const r of rs) {
    const key = r.bookingId ?? r.rowId;
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(r);
    } else {
      byKey.set(key, {
        bookingId: key,
        startDate: r.startDate,
        endDate: r.endDate,
        bookerId: r.bookerId,
        bookerName: r.bookerName ?? r.bookerEmail ?? null,
        createdAt: r.createdAt,
        rows: [r],
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export interface RequestsProps {
  rows: RequestRow[];
  viewerId: string;
  /** `roomId → capacity` (null = unlimited). Serialisable map for conflicts. */
  roomCapacities: Record<string, number | null>;
}

export function participantLabel(r: RequestRow): string {
  return r.participantName ?? r.participantEmail ?? r.guestName ?? '—';
}

/**
 * A single non-conflicting request, or a cluster of requests that conflict with
 * one another (overlapping dates + competing for the same space). Built in the
 * original `groupRequests` order so the list stays chronologically stable.
 */
export type RequestItem =
  | { kind: 'single'; group: RequestGroup }
  | { kind: 'conflict'; id: string; reasons: ConflictReason[]; groups: RequestGroup[] };

export type { ConflictReason };

export function buildRequestItems(
  groups: RequestGroup[],
  roomCapacities: Record<string, number | null>,
): RequestItem[] {
  const report = detectRequestConflicts(
    groups.map((g) => ({
      id: g.bookingId,
      startDate: g.startDate,
      endDate: g.endDate,
      targets: g.rows.map((r) => ({
        kind: r.targetKind,
        roomId: r.targetKind === 'BED' ? r.bedRoomId : r.roomId,
        bedId: r.bedId,
      })),
    })),
    new Map(Object.entries(roomCapacities)),
  );

  const items: RequestItem[] = [];
  const emitted = new Set<number>();
  for (const g of groups) {
    const ci = report.clusterIndexById.get(g.bookingId);
    if (ci === undefined) {
      items.push({ kind: 'single', group: g });
      continue;
    }
    if (emitted.has(ci)) continue;
    emitted.add(ci);
    const cluster = report.clusters[ci]!;
    const byId = new Map(groups.map((x) => [x.bookingId, x]));
    items.push({
      kind: 'conflict',
      id: `conflict-${ci}`,
      reasons: cluster.reasons,
      groups: cluster.ids.map((id) => byId.get(id)!),
    });
  }
  return items;
}
