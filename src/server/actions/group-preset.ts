'use server';

import { getGroup } from './groups';

export interface BookingGroupPreset {
  members: Array<{
    userId: string | null;
    guestName: string | null;
    preferredRoomId: string | null;
    preferredBedId: string | null;
  }>;
}

/** Server action wrapper so the booking client can pull a group preset over
 *  the network without bundling the heavier `getGroup` action client-side. */
export async function fetchGroupForBooking(groupId: string): Promise<BookingGroupPreset | null> {
  const group = await getGroup(groupId);
  if (!group.ok) return null;
  return {
    members: group.data.members.map((m) => ({
      userId: m.userId,
      guestName: m.guestName,
      preferredRoomId: m.preferredRoomId,
      preferredBedId: m.preferredBedId,
    })),
  };
}
