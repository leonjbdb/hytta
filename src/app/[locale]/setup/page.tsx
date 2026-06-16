import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isCottageConfigured } from '@/lib/cottage';
import { PublicPreferences } from '@/components/PublicPreferences';
import { SetupForm } from './SetupForm';

/**
 * First-run setup screen. Lives outside the `(auth)` / `(authenticated)` route
 * groups so it isn't subject to their "cottage must be configured" guard — that
 * guard funnels here, and this page is where the funnel ends. Reachable without
 * a session ('/setup' is listed in the middleware's public paths) so a brand-new
 * instance with no users yet can still be named.
 *
 * Once a name exists there's nothing to do here, so we bounce to /login.
 */
export default async function SetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await isCottageConfigured()) redirect('/login');

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-md justify-end px-4 pt-4">
        <PublicPreferences />
      </div>
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-md flex-col justify-center px-4 py-10">
        <SetupForm />
      </main>
    </div>
  );
}
