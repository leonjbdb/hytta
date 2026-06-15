import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { aliasedTable, asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { BED_CAPACITY, beds, reservations, rooms, users } from '@/db/schema';
import { pickVariant } from '@/lib/device/pick';
import { Requests as RequestsDesktop } from './desktop/Requests';
import { Requests as RequestsMobile } from './mobile/Requests';
import type { RequestRow } from './shared';

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!session.user.isManager) redirect('/dashboard');

  const participantUser = aliasedTable(users, 'participant_user');
  const bookerUser = aliasedTable(users, 'booker_user');

  const rows = await db
    .select({
      rowId: reservations.id,
      bookingId: reservations.bookingId,
      participantId: reservations.userId,
      participantName: participantUser.name,
      participantEmail: participantUser.email,
      participantIsAdmin: participantUser.isAdmin,
      participantIsManager: participantUser.isManager,
      guestName: reservations.guestName,
      bookerId: reservations.bookerId,
      bookerName: bookerUser.name,
      bookerEmail: bookerUser.email,
      targetKind: reservations.targetKind,
      roomId: reservations.roomId,
      bedId: reservations.bedId,
      bedRoomId: beds.roomId,
      roomNameNb: rooms.nameNb,
      roomNameEn: rooms.nameEn,
      roomIcon: rooms.icon,
      roomColor: rooms.color,
      bedLabel: beds.label,
      bedKind: beds.kind,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      status: reservations.status,
      createdAt: reservations.createdAt,
    })
    .from(reservations)
    .leftJoin(participantUser, eq(participantUser.id, reservations.userId))
    .leftJoin(bookerUser, eq(bookerUser.id, reservations.bookerId))
    .leftJoin(rooms, eq(rooms.id, reservations.roomId))
    .leftJoin(beds, eq(beds.id, reservations.bedId))
    .where(eq(reservations.status, 'PENDING'))
    .orderBy(asc(reservations.createdAt), asc(reservations.startDate))
    .all() as RequestRow[];

  // Room capacities for the conflict detector: BEDS-mode rooms sum their bed
  // slots; SLOTS-mode rooms use `slotCount` (NULL = unlimited).
  const roomRows = await db
    .select({ id: rooms.id, capacityMode: rooms.capacityMode, slotCount: rooms.slotCount })
    .from(rooms)
    .all();
  const bedRows = await db.select({ roomId: beds.roomId, kind: beds.kind }).from(beds).all();
  const bedSlotsByRoom = new Map<string, number>();
  for (const b of bedRows) {
    bedSlotsByRoom.set(b.roomId, (bedSlotsByRoom.get(b.roomId) ?? 0) + BED_CAPACITY[b.kind]);
  }
  const roomCapacities: Record<string, number | null> = {};
  for (const r of roomRows) {
    roomCapacities[r.id] =
      r.capacityMode === 'SLOTS' ? r.slotCount : (bedSlotsByRoom.get(r.id) ?? 0);
  }

  return pickVariant({
    desktop: RequestsDesktop,
    mobile: RequestsMobile,
    props: { rows, viewerId: session.user.id, roomCapacities },
  });
}
