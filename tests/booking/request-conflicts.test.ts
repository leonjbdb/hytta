import { describe, expect, it } from 'bun:test';
import {
  detectRequestConflicts,
  type ConflictInput,
  type RequestTarget,
  type RoomCapacityMap,
} from '@/lib/booking/request-conflicts';

const slot = (roomId: string): RequestTarget => ({ kind: 'SLOT', roomId, bedId: null });
const bed = (roomId: string, bedId: string): RequestTarget => ({ kind: 'BED', roomId, bedId });
const whole = (roomId: string): RequestTarget => ({ kind: 'ROOM', roomId, bedId: null });
const cottage: RequestTarget = { kind: 'FULL_COTTAGE', roomId: null, bedId: null };

function booking(
  id: string,
  startDate: string,
  endDate: string,
  targets: RequestTarget[],
): ConflictInput {
  return { id, startDate, endDate, targets };
}

const caps = (entries: Record<string, number | null>): RoomCapacityMap =>
  new Map(Object.entries(entries));

describe('detectRequestConflicts', () => {
  it('reports nothing when ranges do not overlap', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-03', [slot('R')]),
        booking('b', '2026-01-04', '2026-01-06', [slot('R')]),
      ],
      caps({ R: 1 }),
    );
    expect(report.clusters).toHaveLength(0);
    expect(report.clusterIndexById.size).toBe(0);
  });

  it('reports nothing for distinct rooms within capacity', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [slot('R1')]),
        booking('b', '2026-01-02', '2026-01-04', [slot('R2')]),
      ],
      caps({ R1: 2, R2: 2 }),
    );
    expect(report.clusters).toHaveLength(0);
  });

  it('flags a whole-cottage request against any overlapping request', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [cottage]),
        booking('b', '2026-01-03', '2026-01-04', [slot('R')]),
      ],
      caps({ R: 4 }),
    );
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]!.ids).toEqual(['a', 'b']);
    expect(report.clusters[0]!.reasons).toEqual(['fullCottage']);
  });

  it('flags two requests for the same bed', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [bed('R', 'BED1')]),
        booking('b', '2026-01-02', '2026-01-03', [bed('R', 'BED1')]),
      ],
      caps({ R: 4 }),
    );
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]!.reasons).toEqual(['sameResource']);
  });

  it('does not flag different beds in a room with spare capacity', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [bed('R', 'BED1')]),
        booking('b', '2026-01-02', '2026-01-03', [bed('R', 'BED2')]),
      ],
      caps({ R: 2 }),
    );
    expect(report.clusters).toHaveLength(0);
  });

  it('flags a whole-room hold against a slot in the same room', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [whole('R')]),
        booking('b', '2026-01-02', '2026-01-03', [slot('R')]),
      ],
      caps({ R: 4 }),
    );
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]!.reasons).toEqual(['sameResource']);
  });

  it('flags slot demand that exceeds room capacity', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [slot('R')]),
        booking('b', '2026-01-02', '2026-01-03', [slot('R')]),
      ],
      caps({ R: 1 }),
    );
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]!.reasons).toEqual(['overCapacity']);
  });

  it('catches an N-way overflow where every pair is individually fine', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-10', [slot('R')]),
        booking('b', '2026-01-02', '2026-01-10', [slot('R')]),
        booking('c', '2026-01-03', '2026-01-10', [slot('R')]),
      ],
      caps({ R: 2 }),
    );
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]!.ids).toEqual(['a', 'b', 'c']);
    expect(report.clusters[0]!.reasons).toEqual(['overCapacity']);
  });

  it('does not flag slot demand within capacity', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [slot('R')]),
        booking('b', '2026-01-02', '2026-01-03', [slot('R')]),
      ],
      caps({ R: 2 }),
    );
    expect(report.clusters).toHaveLength(0);
  });

  it('treats a null-capacity room as unlimited for slot demand', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [slot('R')]),
        booking('b', '2026-01-02', '2026-01-03', [slot('R')]),
      ],
      caps({ R: null }),
    );
    expect(report.clusters).toHaveLength(0);
  });

  it('still flags whole-room exclusivity on an unlimited room', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [whole('R')]),
        booking('b', '2026-01-02', '2026-01-03', [slot('R')]),
      ],
      caps({ R: null }),
    );
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]!.reasons).toEqual(['sameResource']);
  });

  it('merges a transitive cluster and unions reasons', () => {
    // a holds the cottage (conflicts with b and c); b and c also share a bed.
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-10', [cottage]),
        booking('b', '2026-01-02', '2026-01-04', [bed('R', 'BED1')]),
        booking('c', '2026-01-03', '2026-01-05', [bed('R', 'BED1')]),
      ],
      caps({ R: 4 }),
    );
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]!.ids).toEqual(['a', 'b', 'c']);
    expect(report.clusters[0]!.reasons).toEqual(['fullCottage', 'sameResource']);
  });

  it('keeps independent conflicts in separate clusters', () => {
    const report = detectRequestConflicts(
      [
        booking('a', '2026-01-01', '2026-01-05', [bed('R1', 'BED1')]),
        booking('b', '2026-01-02', '2026-01-03', [bed('R1', 'BED1')]),
        booking('c', '2026-02-01', '2026-02-05', [bed('R2', 'BED9')]),
        booking('d', '2026-02-02', '2026-02-03', [bed('R2', 'BED9')]),
      ],
      caps({ R1: 4, R2: 4 }),
    );
    expect(report.clusters).toHaveLength(2);
    expect(report.clusterIndexById.get('a')).toBe(report.clusterIndexById.get('b'));
    expect(report.clusterIndexById.get('c')).toBe(report.clusterIndexById.get('d'));
    expect(report.clusterIndexById.get('a')).not.toBe(report.clusterIndexById.get('c'));
  });
});
