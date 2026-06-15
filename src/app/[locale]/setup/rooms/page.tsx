import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth, signOut } from '@/lib/auth/config';
import { isCottageConfigured } from '@/lib/cottage';
import { hasAnyRoom } from '@/lib/rooms';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RoomsSetup } from './RoomsSetup';

/**
 * Second first-run gate (after naming the cottage): a cottage needs at least one
 * room before anyone can book. Lives outside the `(authenticated)` group so the
 * layout's "no rooms → /setup/rooms" redirect can't loop. Admins get a form to
 * create the first room; everyone else waits for an admin.
 */
export default async function RoomSetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!(await isCottageConfigured())) redirect('/setup');

  // Non-admins can't create rooms — show the wait notice (or move them on if an
  // admin has since added the rooms).
  if (!session.user.isAdmin) {
    if (await hasAnyRoom()) redirect('/');
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
        <NoRoomsNotice />
      </main>
    );
  }

  // Admins set rooms up here. We deliberately DON'T redirect once a room exists:
  // creating a room triggers a Server-Action route refresh, and an early
  // `hasAnyRoom` redirect would eject the admin after their first room. They add
  // as many rooms as they like and leave via the Finish button. `initialHasRooms`
  // keeps Finish enabled even after a browser refresh (when the in-session list
  // resets but rooms already exist).
  return <RoomsSetup initialHasRooms={await hasAnyRoom()} />;
}

async function NoRoomsNotice() {
  const t = await getTranslations('RoomSetup');
  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('noRoomsTitle')}</CardTitle>
        <CardDescription>{t('noRoomsBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            {t('signOut')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
