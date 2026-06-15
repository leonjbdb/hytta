import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { asc } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { beds, rooms, users } from '@/db/schema';
import { getGroup } from '@/server/actions/groups';
import { pickVariant } from '@/lib/device/pick';
import { GroupEdit as GroupEditDesktop } from './desktop/GroupEdit';
import { GroupEdit as GroupEditMobile } from './mobile/GroupEdit';

export default async function GroupEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const group = await getGroup(id);
  if (!group.ok) redirect('/groups');

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
  const allUsers = (await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.email))
    .all())
    .map((u) => ({ id: u.id, name: u.name ?? u.email }));

  return pickVariant({
    desktop: GroupEditDesktop,
    mobile: GroupEditMobile,
    props: {
      group: group.data,
      rooms: allRooms,
      beds: allBeds,
      users: allUsers,
      currentUserId: session.user.id,
    },
  });
}
