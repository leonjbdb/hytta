import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { beds, rooms, users } from '@/db/schema';
import { getCottageName } from '@/lib/cottage';
import { pickVariant } from '@/lib/device/pick';
import { Admin as AdminDesktop } from './desktop/Admin';
import { Admin as AdminMobile } from './mobile/Admin';
import type { AdminBed, AdminRoom, AdminUser } from './shared';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!session.user.isAdmin) redirect('/dashboard');

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
    .all() as AdminRoom[];

  const allBeds = await db
    .select({ id: beds.id, roomId: beds.roomId, kind: beds.kind, label: beds.label })
    .from(beds)
    .orderBy(asc(beds.label))
    .all() as AdminBed[];

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isAdmin: users.isAdmin,
      isManager: users.isManager,
      isInvitee: users.isInvitee,
    })
    .from(users)
    .orderBy(asc(users.email))
    .all() as AdminUser[];

  const adminCount = (await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isAdmin, true))
    .all()).length;

  return pickVariant({
    desktop: AdminDesktop,
    mobile: AdminMobile,
    props: {
      cottageName: await getCottageName() ?? '',
      rooms: allRooms,
      beds: allBeds,
      users: allUsers,
      adminCount,
      viewerId: session.user.id,
    },
  });
}
