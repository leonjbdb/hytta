'use client';

import { useLocale } from 'next-intl';
import type { OccupantRef } from '@/lib/booking/types';
import { formatStay } from '@/lib/booking/format-stay';
import { PersonBadge } from '@/components/PersonBadge';
import { BookedByMultiple } from './BookedByMultiple';

/**
 * Renders the people who already hold a bed or slot. Everyone who fits within
 * `capacity` is shown as their own badge — so two people genuinely sharing a
 * double bed each appear, marked as booked. Only when there are MORE distinct
 * people than the capacity (which can only happen with back-to-back stays that
 * can't all be present at once) do they collapse to a single "booked by
 * multiple people" label whose tooltip lists who and when. `capacity` null =
 * unlimited (never collapses).
 */
export function BookedOccupants({
  occupants,
  capacity,
}: {
  occupants: OccupantRef[];
  capacity: number | null;
}) {
  const locale = useLocale();
  if (occupants.length === 0) return null;
  const distinctPeople = new Set(occupants.map((o) => o.name)).size;
  if (capacity != null && distinctPeople > capacity) {
    return <BookedByMultiple occupants={occupants} />;
  }
  return (
    <>
      {occupants.map((o, i) => (
        <PersonBadge
          key={`${o.name}-${o.startDate}-${o.endDate}-${i}`}
          name={o.name}
          isGuest={o.isGuest}
          isAdmin={o.isAdmin}
          isManager={o.isManager}
          when={formatStay(o, locale)}
        />
      ))}
    </>
  );
}
