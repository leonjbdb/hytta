import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getPendingEmailChange } from '@/lib/auth/email-change';
import { isDemoMode } from '@/lib/demo-mode';
import { pickVariant } from '@/lib/device/pick';
import { Settings as SettingsDesktop } from './desktop/Settings';
import { Settings as SettingsMobile } from './mobile/Settings';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const me = (await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
      notifyEnabled: users.notifyEnabled,
      notifyBooking: users.notifyBooking,
      notifyRequests: users.notifyRequests,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .all())[0];

  if (!me) redirect('/login');

  // Demo mode never sends real email, so there's no pending change to surface
  // and the form is locked anyway — skip the lookup.
  const demo = isDemoMode();
  const pendingEmail = demo ? null : await getPendingEmailChange(db, me.id);

  return pickVariant({
    desktop: SettingsDesktop,
    mobile: SettingsMobile,
    props: {
      // Fall back to the legacy single `name` for accounts created before the
      // first/last split that haven't re-saved their profile yet.
      firstName: me.firstName ?? me.name ?? '',
      lastName: me.lastName ?? '',
      email: me.email,
      pendingEmail,
      isDemo: demo,
      hasPassword: Boolean(me.passwordHash),
      isAdmin: Boolean(session.user.isAdmin),
      isManager: Boolean(session.user.isManager),
      notifyEnabled: me.notifyEnabled,
      notifyBooking: me.notifyBooking,
      notifyRequests: me.notifyRequests,
    },
  });
}
