import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { aliasedTable, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { dugnadTasks, users } from '@/db/schema';
import { pickVariant } from '@/lib/device/pick';
import { Dugnad as DugnadDesktop } from './desktop/Dugnad';
import { Dugnad as DugnadMobile } from './mobile/Dugnad';
import type { DugnadRow } from './shared';

export default async function DugnadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const creator = aliasedTable(users, 'dugnad_creator');
  const completer = aliasedTable(users, 'dugnad_completer');

  const baseSelect = {
    id: dugnadTasks.id,
    title: dugnadTasks.title,
    description: dugnadTasks.description,
    createdBy: dugnadTasks.createdBy,
    createdByName: creator.name,
    createdByEmail: creator.email,
    createdByIsAdmin: creator.isAdmin,
    createdByIsManager: creator.isManager,
    createdAt: dugnadTasks.createdAt,
    completedBy: dugnadTasks.completedBy,
    completedByName: completer.name,
    completedByEmail: completer.email,
    completedByIsAdmin: completer.isAdmin,
    completedByIsManager: completer.isManager,
    completedAt: dugnadTasks.completedAt,
  };

  const open = await db
    .select(baseSelect)
    .from(dugnadTasks)
    .leftJoin(creator, eq(creator.id, dugnadTasks.createdBy))
    .leftJoin(completer, eq(completer.id, dugnadTasks.completedBy))
    .where(isNull(dugnadTasks.completedAt))
    .orderBy(desc(dugnadTasks.createdAt), asc(dugnadTasks.id))
    .all() as DugnadRow[];

  const completed = await db
    .select(baseSelect)
    .from(dugnadTasks)
    .leftJoin(creator, eq(creator.id, dugnadTasks.createdBy))
    .leftJoin(completer, eq(completer.id, dugnadTasks.completedBy))
    .where(isNotNull(dugnadTasks.completedAt))
    .orderBy(desc(dugnadTasks.completedAt), asc(dugnadTasks.id))
    .all() as DugnadRow[];

  return pickVariant({
    desktop: DugnadDesktop,
    mobile: DugnadMobile,
    props: {
      open,
      completed,
      viewerId: session.user.id,
      isAdmin: Boolean(session.user.isAdmin),
    },
  });
}
