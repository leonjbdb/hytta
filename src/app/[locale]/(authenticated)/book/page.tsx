import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { rooms, beds, users, reservations } from '@/db/schema';
import { listMyGroups } from '@/server/actions/groups';
import { pickVariant } from '@/lib/device/pick';
import type { EditBookingState } from '@/lib/booking/use-booking-draft';
import type { ParticipantPick, Selection } from '@/components/booking/RoomBedPicker.desktop';
import { Booking as BookingDesktop } from './desktop/Booking';
import { Booking as BookingMobile } from './mobile/Booking';

/**
 * Rebuild the editor's Selection from a booking's stored reservation rows so
 * the user lands back in the exact placement they had.
 */
function reconstructEdit(
  bookingId: string,
  rows: {
    userId: string | null;
    guestName: string | null;
    targetKind: 'FULL_COTTAGE' | 'ROOM' | 'BED' | 'SLOT';
    roomId: string | null;
    bedId: string | null;
    startDate: string;
    endDate: string;
  }[],
  bedRoom: Map<string, string>,
): EditBookingState {
  const toPick = (r: { userId: string | null; guestName: string | null }): ParticipantPick =>
    r.userId ? { kind: 'user', userId: r.userId } : { kind: 'guest', name: r.guestName ?? '' };

  let selection: Selection;
  if (rows.some((r) => r.targetKind === 'FULL_COTTAGE')) {
    selection = { mode: 'FULL_COTTAGE', fullCottageParticipants: rows.map(toPick), rooms: {} };
  } else {
    const roomsMap: Record<string, ParticipantPick[]> = {};
    for (const r of rows) {
      const roomId = r.targetKind === 'BED' && r.bedId ? bedRoom.get(r.bedId) : r.roomId;
      if (!roomId) continue;
      const pick =
        r.targetKind === 'BED' && r.bedId ? { ...toPick(r), bedId: r.bedId } : toPick(r);
      (roomsMap[roomId] ??= []).push(pick);
    }
    selection = { mode: 'ROOMS', fullCottageParticipants: [], rooms: roomsMap };
  }

  return { bookingId, startDate: rows[0]!.startDate, endDate: rows[0]!.endDate, selection };
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { locale } = await params;
  const { edit: editId } = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const allRooms = await db
    .select({
      id: rooms.id,
      nameNb: rooms.nameNb,
      nameEn: rooms.nameEn,
      icon: rooms.icon,
      color: rooms.color,
      capacityMode: rooms.capacityMode,
      slotCount: rooms.slotCount,
    })
    .from(rooms)
    .orderBy(asc(rooms.nameNb))
    .all();
  const allBeds = await db
    .select({ id: beds.id, roomId: beds.roomId, kind: beds.kind, label: beds.label })
    .from(beds)
    .orderBy(asc(beds.label))
    .all();
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.name))
    .all();
  const myGroups = await listMyGroups();

  // When ?edit=<bookingId> is present, load that booking and reconstruct the
  // editor state — but only if the viewer may modify it (owner or admin).
  let editBooking: EditBookingState | undefined;
  if (editId) {
    const editRows = await db
      .select({
        userId: reservations.userId,
        guestName: reservations.guestName,
        bookerId: reservations.bookerId,
        targetKind: reservations.targetKind,
        roomId: reservations.roomId,
        bedId: reservations.bedId,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.bookingId, editId),
          inArray(reservations.status, ['CONFIRMED', 'PENDING']),
        ),
      )
      .all();
    const owner = editRows[0]?.bookerId;
    const canModify = owner === session.user.id || Boolean(session.user.isAdmin);
    if (editRows.length > 0 && canModify) {
      const bedRoom = new Map(allBeds.map((b) => [b.id, b.roomId]));
      editBooking = reconstructEdit(editId, editRows, bedRoom);
    }
  }

  return pickVariant({
    desktop: BookingDesktop,
    mobile: BookingMobile,
    props: {
      rooms: allRooms,
      beds: allBeds,
      users: allUsers.map((u) => ({ id: u.id, name: u.name ?? u.email })),
      groups: myGroups.map((g) => ({ id: g.id, name: g.name })),
      currentUserId: session.user.id,
      edit: editBooking,
    },
  });
}
