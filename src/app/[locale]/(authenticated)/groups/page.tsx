import { setRequestLocale } from 'next-intl/server';
import { listMyGroups } from '@/server/actions/groups';
import { pickVariant } from '@/lib/device/pick';
import { Groups as GroupsDesktop } from './desktop/Groups';
import { Groups as GroupsMobile } from './mobile/Groups';

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const groups = await listMyGroups();
  return pickVariant({
    desktop: GroupsDesktop,
    mobile: GroupsMobile,
    props: { groups },
  });
}
