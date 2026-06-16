import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { FirstLoginForm } from './FirstLoginForm';

export default async function FirstLoginPage({
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
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      notifyEnabled: users.notifyEnabled,
      notifyBooking: users.notifyBooking,
      notifyRequests: users.notifyRequests,
      firstLoginCompletedAt: users.firstLoginCompletedAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .all())[0];

  if (!me) redirect('/login');
  if (me.firstLoginCompletedAt != null) redirect('/dashboard');

  return (
    <FirstLoginForm
      email={me.email}
      initialFirstName={me.firstName ?? ''}
      initialLastName={me.lastName ?? ''}
      initialNotifyEnabled={me.notifyEnabled}
      initialNotifyBooking={me.notifyBooking}
      initialNotifyRequests={me.notifyRequests}
      isManager={session.user.isManager}
    />
  );
}
