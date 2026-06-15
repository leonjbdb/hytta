/**
 * Detects conflicts *between pending booking requests* so the requests page can
 * group competing requests and warn the manager before approval.
 *
 * The booking pipeline only blocks a new request against CONFIRMED reservations
 * (see `conflicts.ts`); two PENDING requests for the same slot are allowed to
 * coexist on purpose — a manager picks the winner. Approval, however, does *not*
 * re-run the conflict check, so approving both halves of a conflicting pair
 * would silently double-book. This module surfaces those collisions.
 *
 * A pair of date-overlapping requests conflicts when any of the canonical
 * cases from `conflicts.ts` would hold if both were CONFIRMED:
 *   - either request holds the whole cottage          → `fullCottage`
 *   - they share a bed, or one holds a whole room the
 *     other also touches (room / slot / bed within it) → `sameResource`
 *   - their combined slot demand on a room exceeds the
 *     room's capacity at any instant                   → `overCapacity`
 *
 * Capacity is evaluated with an interval peak-load check, so an N-way overflow
 * (each pair individually fine, the trio over capacity) is still caught.
 */

export type RequestTargetKind = 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT';

export interface RequestTarget {
  kind: RequestTargetKind;
  /**
   * Room this target occupies: the reservation's `roomId` for ROOM/SLOT, the
   * bed's parent room for BED, `null` for FULL_COTTAGE.
   */
  roomId: string | null;
  /** Specific bed for BED targets; `null` otherwise. */
  bedId: string | null;
}

export interface ConflictInput {
  /** Booking id — opaque key echoed back in the report. */
  id: string;
  /** Inclusive ISO date range (`YYYY-MM-DD`). */
  startDate: string;
  endDate: string;
  targets: RequestTarget[];
}

export type ConflictReason = 'fullCottage' | 'sameResource' | 'overCapacity';

export interface ConflictCluster {
  /** Member booking ids, in the order they appeared in the input. */
  ids: string[];
  /** Why these requests were grouped (union of the triggering reasons). */
  reasons: ConflictReason[];
}

export interface ConflictReport {
  clusters: ConflictCluster[];
  /** Booking id → index into `clusters`. Only ids in a ≥2 cluster appear. */
  clusterIndexById: Map<string, number>;
}

/** `roomId → capacity`; `null` means unlimited (no capacity ceiling). */
export type RoomCapacityMap = Map<string, number | null>;

const REASON_ORDER: ConflictReason[] = ['fullCottage', 'sameResource', 'overCapacity'];

/** Closed-interval overlap — both endpoints inclusive, matching the booking engine. */
function overlaps(a: ConflictInput, b: ConflictInput): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

function isFullCottage(b: ConflictInput): boolean {
  return b.targets.some((t) => t.kind === 'FULL_COTTAGE');
}

/** Beds explicitly held, and whole rooms held, plus every room merely touched. */
function resourceFootprint(b: ConflictInput) {
  const beds = new Set<string>();
  const wholeRooms = new Set<string>();
  const roomsTouched = new Set<string>();
  for (const t of b.targets) {
    if (t.bedId) beds.add(t.bedId);
    if (t.kind === 'ROOM' && t.roomId) wholeRooms.add(t.roomId);
    if (t.roomId) roomsTouched.add(t.roomId);
  }
  return { beds, wholeRooms, roomsTouched };
}

/** True when two requests collide on an exact resource (same bed / whole room). */
function sharesResource(a: ConflictInput, b: ConflictInput): boolean {
  const fa = resourceFootprint(a);
  const fb = resourceFootprint(b);
  for (const bed of fa.beds) if (fb.beds.has(bed)) return true;
  for (const room of fa.wholeRooms) if (fb.roomsTouched.has(room)) return true;
  for (const room of fb.wholeRooms) if (fa.roomsTouched.has(room)) return true;
  return false;
}

/** Per-person slot demand a request places on a given room (SLOT + BED rows). */
function demandOnRoom(b: ConflictInput, roomId: string): number {
  let n = 0;
  for (const t of b.targets) {
    if (t.roomId === roomId && (t.kind === 'SLOT' || t.kind === 'BED')) n += 1;
  }
  return n;
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[i] !== root) {
      const next = this.parent[i]!;
      this.parent[i] = root;
      i = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

export function detectRequestConflicts(
  bookings: ConflictInput[],
  capacityByRoom: RoomCapacityMap,
): ConflictReport {
  const n = bookings.length;
  const uf = new UnionFind(n);
  // Each assertion is "these members conflict, for this reason". Unions happen
  // first; reasons are attributed to the settled cluster root afterwards.
  const assertions: { members: number[]; reason: ConflictReason }[] = [];

  // 1. Pairwise full-cottage and exact-resource collisions.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!overlaps(bookings[i]!, bookings[j]!)) continue;
      if (isFullCottage(bookings[i]!) || isFullCottage(bookings[j]!)) {
        assertions.push({ members: [i, j], reason: 'fullCottage' });
        continue;
      }
      if (sharesResource(bookings[i]!, bookings[j]!)) {
        assertions.push({ members: [i, j], reason: 'sameResource' });
      }
    }
  }

  // 2. Per-room capacity overflow via interval peak-load. The maximum
  // concurrent demand on a room is always reached at some request's start day,
  // so sampling start days detects any overflow that exists.
  const sampleDays = [...new Set(bookings.map((b) => b.startDate))];
  for (const [roomId, capacity] of capacityByRoom) {
    if (capacity == null) continue; // unlimited — only exclusivity (handled above) matters
    for (const day of sampleDays) {
      let total = 0;
      const active: number[] = [];
      for (let i = 0; i < n; i++) {
        const b = bookings[i]!;
        if (b.startDate > day || b.endDate < day) continue;
        const d = demandOnRoom(b, roomId);
        if (d > 0) {
          total += d;
          active.push(i);
        }
      }
      if (total > capacity && active.length >= 2) {
        assertions.push({ members: active, reason: 'overCapacity' });
      }
    }
  }

  for (const a of assertions) {
    for (let k = 1; k < a.members.length; k++) uf.union(a.members[0]!, a.members[k]!);
  }

  const reasonsByRoot = new Map<number, Set<ConflictReason>>();
  for (const a of assertions) {
    const root = uf.find(a.members[0]!);
    const set = reasonsByRoot.get(root) ?? new Set<ConflictReason>();
    set.add(a.reason);
    reasonsByRoot.set(root, set);
  }

  const membersByRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const list = membersByRoot.get(root) ?? [];
    list.push(i);
    membersByRoot.set(root, list);
  }

  const clusters: ConflictCluster[] = [];
  const clusterIndexById = new Map<string, number>();
  // Emit clusters in the order their first member appears in the input.
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (root !== i) continue; // process each root once, at its first member
    const members = membersByRoot.get(root)!;
    if (members.length < 2) continue;
    const reasons = REASON_ORDER.filter((r) => reasonsByRoot.get(root)?.has(r));
    if (reasons.length === 0) continue; // safety: ≥2 members always have a reason
    const index = clusters.length;
    clusters.push({ ids: members.map((m) => bookings[m]!.id), reasons });
    for (const m of members) clusterIndexById.set(bookings[m]!.id, index);
  }

  return { clusters, clusterIndexById };
}
