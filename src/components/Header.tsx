import { eq, sql } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { auth, signOut } from '@/lib/auth/config';
import { db } from '@/db/client';
import { reservations, users } from '@/db/schema';
import { shortDisplayName } from '@/lib/name';
import { Button } from '@/components/ui/button';
import { HeaderDesktopControls } from './HeaderUI.desktop';
import { HeaderMobileControls } from './HeaderUI.mobile';

export async function Header() {
  const session = await auth();
  let userName: string | null = null;
  let userShortName: string | null = null;
  if (session?.user?.id) {
    const row = (await db
      .select({
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .all())[0];
    userName = row?.name ?? row?.email ?? null;
    // Header shows a compact "first given name + surname"; fall back to the
    // full name (or email) when the parts aren't set.
    const short = shortDisplayName(row?.firstName, row?.lastName);
    userShortName = short || userName;
  }

  // Manager nav badge: count of distinct bookings with at least one PENDING
  // row. Uses a sub-select on bookingId so multi-row bookings count once.
  let pendingCount = 0;
  if (session?.user?.isManager) {
    const row = (await db.all<{ n: number }>(sql`
      SELECT COUNT(DISTINCT booking_id) AS n
      FROM reservation
      WHERE status = 'PENDING' AND booking_id IS NOT NULL
    `))[0];
    pendingCount = Number(row?.n ?? 0);
    if (pendingCount === 0) {
      // Fallback for any legacy row without bookingId.
      const orphan = await db
        .select({ id: reservations.id })
        .from(reservations)
        .where(eq(reservations.status, 'PENDING'))
        .all();
      pendingCount = orphan.length;
    }
  }

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  const userPresent = Boolean(session?.user);
  const isAdmin = Boolean(session?.user?.isAdmin);
  const isManager = Boolean(session?.user?.isManager);
  const isInvitee = Boolean(session?.user?.isInvitee);

  const tCommon = await getTranslations('Common');
  const tBrand = await getTranslations('Brand');

  // One header shell, one brand link. The right-side controls differ by
  // viewport but are only *content* of this single banner — the shell and
  // brand are rendered once so we don't emit two `<header>` landmarks or a
  // duplicate brand link.
  //
  // Chrome picks the control variant on the CLIENT via CSS breakpoints, not
  // server-side UA detection. Page bodies use `pickVariant` (server UA) so the
  // heavy variant ships once, but the header lives in the shared
  // `(authenticated)` layout — a segment the client Router Cache reuses across
  // navigations. A server-UA decision baked into that cached layout would stick
  // (e.g. desktop controls atop a mobile page). Rendering both control clusters
  // and toggling with `md:` is immune to that and always matches the viewport.
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-md">
      {/* A touch wider than the page content (max-w-5xl) so the header sits
          with slightly less margin on the left and right on desktop. */}
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link
          href={userPresent ? '/dashboard' : '/login'}
          className="font-semibold tracking-tight"
        >
          {tBrand('name')}
        </Link>

        {userPresent ? (
          <>
            <div className="ml-auto flex items-center gap-2 md:hidden">
              <HeaderMobileControls
                userName={userName}
                isAdmin={isAdmin}
                isManager={isManager}
                isInvitee={isInvitee}
                pendingCount={pendingCount}
                signOutAction={signOutAction}
              />
            </div>
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <HeaderDesktopControls
                userName={userName}
                userShortName={userShortName}
                isAdmin={isAdmin}
                isManager={isManager}
                isInvitee={isInvitee}
                pendingCount={pendingCount}
                signOutAction={signOutAction}
              />
            </div>
          </>
        ) : (
          <Link href="/login" className="ml-auto">
            <Button size="sm">
              <LogIn className="size-4" />
              {tCommon('signIn')}
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
