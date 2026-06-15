'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Selection } from '@/components/booking/RoomBedPicker.desktop';

export interface BookingDraft {
  /** ISO YYYY-MM-DD; null when no start date is picked yet. */
  startDate: string | null;
  /** ISO YYYY-MM-DD; null until the user picks an end date. */
  endDate: string | null;
  selection: Selection;
}

/**
 * An existing booking loaded into the editor. The booking page reconstructs
 * this from the stored reservation rows so the user can change the dates and
 * placement and save back to the same booking.
 */
export interface EditBookingState {
  bookingId: string;
  startDate: string;
  endDate: string;
  selection: Selection;
}

const KEY = ['bookingDraft'] as const;

export function emptyDraft(currentUserId: string): BookingDraft {
  return {
    startDate: null,
    endDate: null,
    selection: {
      mode: 'FULL_COTTAGE',
      fullCottageParticipants: [{ kind: 'user', userId: currentUserId }],
      rooms: {},
    },
  };
}

export function useBookingDraft(currentUserId: string) {
  const qc = useQueryClient();
  const fallback = React.useMemo(() => emptyDraft(currentUserId), [currentUserId]);

  const { data } = useQuery<BookingDraft>({
    queryKey: KEY,
    queryFn: () => qc.getQueryData<BookingDraft>(KEY) ?? fallback,
    initialData: () => qc.getQueryData<BookingDraft>(KEY) ?? fallback,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const update = React.useCallback(
    (patch: Partial<BookingDraft>) => {
      qc.setQueryData<BookingDraft>(KEY, (prev) => ({
        ...(prev ?? fallback),
        ...patch,
      }));
    },
    [qc, fallback],
  );

  const clear = React.useCallback(() => {
    qc.setQueryData<BookingDraft>(KEY, fallback);
  }, [qc, fallback]);

  return { draft: data ?? fallback, update, clear };
}
