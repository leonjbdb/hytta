'use client';

import * as React from 'react';
import type { AvailabilityTarget } from '@/lib/booking/types';

/**
 * User ids already booked (CONFIRMED) anywhere over the queried range. A
 * registered person can't be in two places at once, so they can't be added to a
 * new booking on overlapping dates — the picker hides them. Guests (no user id)
 * aren't deduplicated.
 */
export function collectBookedUserIds(availability: AvailabilityTarget[]): Set<string> {
  const ids = new Set<string>();
  for (const a of availability) {
    if (a.kind !== 'SLOT_ROOM') continue;
    for (const o of a.takenBy) if (o.userId) ids.add(o.userId);
    for (const bed of a.beds) for (const o of bed.takenBy) if (o.userId) ids.add(o.userId);
  }
  return ids;
}

/** Provides the booked-user set to the participant pickers so they can drop
 *  already-booked people from their options without prop-drilling. */
export const BookedUsersContext = React.createContext<Set<string>>(new Set());
export const useBookedUsers = () => React.useContext(BookedUsersContext);
