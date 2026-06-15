import { eq, sql } from 'drizzle-orm';
import { auth, signOut } from '@/lib/auth/config';
import { db } from '@/db/client';
import { reservations, users } from '@/db/schema';
import { shortDisplayName } from '@/lib/name';
import { HeaderUI as HeaderUIDesktop } from './HeaderUI.desktop';
import { HeaderUI as HeaderUIMobile } from './HeaderUI.mobile';

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

  // Chrome picks its variant on the CLIENT via CSS breakpoints, not server-side
  // UA detection. Page bodies use `pickVariant` (server UA) so the heavy variant
  // ships once, but the header lives in the shared `(authenticated)` layout — a
  // segment the client Router Cache can reuse across navigations. A server UA
  // decision baked into that cached layout would stick (e.g. a desktop header
  // left atop a mobile page). Rendering both and toggling with `md:` is immune
  // to that and always matches the real viewport. Both are light client trees.
  const ui = {
    userPresent: Boolean(session?.user),
    userName,
    userShortName,
    isAdmin: Boolean(session?.user?.isAdmin),
    isManager: Boolean(session?.user?.isManager),
    isInvitee: Boolean(session?.user?.isInvitee),
    pendingCount,
    signOutAction,
  };

  return (
    <>
      <div className="md:hidden">
        <HeaderUIMobile {...ui} />
      </div>
      <div className="hidden md:block">
        <HeaderUIDesktop {...ui} />
      </div>
    </>
  );
}
