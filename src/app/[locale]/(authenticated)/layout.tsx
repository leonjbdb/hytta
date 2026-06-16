import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { isCottageConfigured } from '@/lib/cottage';
import { hasAnyRoom } from '@/lib/rooms';
import { Header } from '@/components/Header';
import { CalendarExport } from '@/components/CalendarExport';
import { ConfirmProvider } from '@/components/ConfirmDialog';

/**
 * Authentication boundary. Every page nested under `(authenticated)` runs
 * this layout, which:
 *   1. Verifies the user has a valid session — redirects to `/login` if not.
 *   2. Renders the global `Header` (only signed-in users see chrome).
 *
 * This is in addition to the edge middleware (`src/middleware.ts`) so even a
 * missed matcher pattern can't leak a page or its data.
 */
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  // No signed-in surface until the cottage has been named on first run.
  if (!(await isCottageConfigured())) redirect('/setup');
  const me = (await db
    .select({ firstLoginCompletedAt: users.firstLoginCompletedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .all())[0];
  if (!me) redirect('/login');
  // First-login setup must happen before the admin is sent to create rooms.
  if (me.firstLoginCompletedAt == null) redirect('/first-login');
  // ...and not until at least one room exists. `/setup/rooms` lives outside this
  // layout, so the redirect can't loop.
  if (!(await hasAnyRoom())) redirect('/setup/rooms');
  // Confirm dialogs make non-admins wait a few seconds before acting; admins,
  // who manage the cottage, are trusted to confirm immediately.
  const confirmDelay = session.user.isAdmin ? 0 : 3;
  return (
    /*
     * Constrained-scroll shell: the viewport is split into Header (top,
     * fixed-height) + a flex-1 scroll container holding `main`. This means
     * scrolling happens inside the middle region only, not on the document,
     * so any bottom-fixed sheet (e.g. the mobile ReservationSummary) sits
     * outside the scroll viewport and the scrollbar — when visible — spans
     * only the gap between header and footer rather than the whole screen.
     *
     * `h-svh` (small viewport height) avoids iOS Safari's `100vh` URL-bar
     * jank where content jumps as the bar collapses/expands.
     */
    <ConfirmProvider delaySeconds={confirmDelay}>
    <div className="flex h-svh flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">{children}</main>
      </div>
      {/*
       * Sticky-bottom slot. Pages with a fixed footer (e.g. the mobile
       * booking summary) portal their footer JSX into this element via
       * `react-dom/createPortal`. The slot lives BELOW the scroll
       * container in the flex column, so the scrollbar above can't extend
       * past it — solving "scrollbar runs over the footer" cleanly without
       * needing `position: fixed`.
       */}
      <div id="hytta-bottom-slot" />
      <CalendarExport />
    </div>
    </ConfirmProvider>
  );
}

/** ID of the layout's bottom-slot div. Pages portal footers in via this. */
export const BOTTOM_SLOT_ID = 'hytta-bottom-slot';
