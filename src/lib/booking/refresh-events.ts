'use client';

/**
 * Cross-component invalidation for booking data.
 *
 * The dashboard's booking list is server-rendered, so a server action calling
 * `revalidatePath` refreshes it. The occupancy calendar, however, fetches its
 * data client-side (`fetchOccupancy` in a `useEffect`), which a server-side
 * revalidate can't reach. After a mutation (e.g. cancelling a stay) we dispatch
 * this event so any mounted calendar refetches and stays in sync.
 */
export const BOOKINGS_CHANGED_EVENT = 'hytta:bookings-changed';

/** Tell client-cached booking views (the occupancy calendar) to refetch. */
export function notifyBookingsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BOOKINGS_CHANGED_EVENT));
  }
}
