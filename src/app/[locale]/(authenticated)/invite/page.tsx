import { redirect } from 'next/navigation';
import { getFormatter, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { listUserInvitations } from '@/lib/auth/invitations';
import { isDemoMode } from '@/lib/demo-mode';
import { requestOrigin } from '@/lib/origin';
import { pickVariant } from '@/lib/device/pick';
import { Invite as InviteDesktop } from './desktop/Invite';
import { Invite as InviteMobile } from './mobile/Invite';
import type { InviteListItem } from './shared';

const EXPIRES_FORMAT = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
} as const;

export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!session.user.isInvitee) redirect('/dashboard');

  const rows = await listUserInvitations(db, session.user.id);
  const formatter = await getFormatter();
  const invites: InviteListItem[] = rows.map((r) => ({
    id: r.id,
    token: r.token,
    maxUses: r.maxUses,
    useCount: r.useCount,
    email: r.email,
    expiresAt: r.expiresAt.getTime(),
    expiresAtLabel: formatter.dateTime(r.expiresAt, EXPIRES_FORMAT),
    revokedAt: r.revokedAt ? r.revokedAt.getTime() : null,
    createdAt: r.createdAt,
  }));

  const origin = await requestOrigin();
  const demo = isDemoMode();

  return pickVariant({
    desktop: InviteDesktop,
    mobile: InviteMobile,
    props: { origin, invites, demo },
  });
}
