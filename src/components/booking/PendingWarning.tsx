'use client';

import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AvailabilityTarget } from '@/lib/booking/types';

/**
 * Heads-up shown when the chosen dates overlap booking requests still awaiting
 * approval. A pending whole-cottage request is called out by name (it would
 * clash with anything you book); otherwise it's a generic note pointing at the
 * amber dots on the affected rooms.
 */
export function PendingWarning({
  availability,
  className,
}: {
  availability: AvailabilityTarget[];
  className?: string;
}) {
  const t = useTranslations('Book');

  const cottage = availability.find(
    (a): a is Extract<AvailabilityTarget, { kind: 'FULL_COTTAGE' }> =>
      a.kind === 'FULL_COTTAGE',
  );
  const cottageNames = cottage?.pendingParticipants.map((p) => p.name) ?? [];
  const roomsPending = availability.some(
    (a) => a.kind === 'SLOT_ROOM' && a.pendingParticipants.length > 0,
  );

  if (cottageNames.length === 0 && !roomsPending) return null;

  const message =
    cottageNames.length > 0
      ? t('warnPendingCottage', { names: cottageNames.join(', ') })
      : t('warnPendingRooms');

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md border border-[var(--color-partial)]/50 bg-[color-mix(in_oklch,var(--card),var(--color-partial)_12%)] p-3 text-sm text-[var(--foreground)]',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--color-clay-800)]" />
      <span>{message}</span>
    </div>
  );
}
