import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { aliasedTable, asc, eq, or } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { beds, reservations, rooms, users } from '@/db/schema';
import { pickVariant } from '@/lib/device/pick';
import { Dashboard as DashboardDesktop } from './desktop/Dashboard';
import { Dashboard as DashboardMobile } from './mobile/Dashboard';
import type { DashboardRow } from './shared';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const viewerId = session.user.id;

  const allRooms = await db
    .select({
      id: rooms.id,
      nameNb: rooms.nameNb,
      nameEn: rooms.nameEn,
      icon: rooms.icon,
      color: rooms.color,
    })
    .from(rooms)
    .orderBy(asc(rooms.nameNb))
    .all();

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
      bookerId: reservations.bookerId,
      bookerName: bookerUser.name,
      bookerEmail: bookerUser.email,
      targetKind: reservations.targetKind,
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
      guestName: reservations.guestName,
    })
    .from(reservations)
    .leftJoin(participantUser, eq(participantUser.id, reservations.userId))
    .leftJoin(bookerUser, eq(bookerUser.id, reservations.bookerId))
    .leftJoin(beds, eq(beds.id, reservations.bedId))
    // Room info comes from the booked room directly, or — for a BED booking —
    // from the bed's parent room, so bed rows still show their room name + icon.
    .leftJoin(rooms, or(eq(rooms.id, reservations.roomId), eq(rooms.id, beds.roomId)))
    .where(
      or(
        eq(reservations.status, 'CONFIRMED'),
        eq(reservations.status, 'PENDING'),
      ),
    )
    .orderBy(asc(reservations.startDate), asc(reservations.createdAt))
    .all() as DashboardRow[];

  const todayISO = new Date().toISOString().slice(0, 10);
  // Three buckets — closed-interval comparison on ISO 8601 dates is correct.
  const past = rows.filter((r) => r.endDate < todayISO);
  const current = rows.filter(
    (r) => r.startDate <= todayISO && r.endDate >= todayISO,
  );
  const upcoming = rows.filter((r) => r.startDate > todayISO);

  return pickVariant({
    desktop: DashboardDesktop,
    mobile: DashboardMobile,
    props: {
      upcoming,
      current,
      past,
      viewerId,
      isManager: Boolean(session.user.isManager),
      isAdmin: Boolean(session.user.isAdmin),
      rooms: allRooms,
    },
  });
}
