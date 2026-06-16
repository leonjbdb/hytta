import { redirect } from 'next/navigation';
import { isCottageConfigured } from '@/lib/cottage';
import { PublicPreferences } from '@/components/PublicPreferences';

/**
 * Public auth pages share a minimal chrome — no Header, no nav. The signed-in
 * Header lives under `(authenticated)` only.
 *
 * Before showing any auth page we make sure the cottage has been named: on a
 * fresh deployment the very first thing to happen is first-run `/setup`. The
 * setup route sits outside this group, so funnelling here can't loop.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (!(await isCottageConfigured())) redirect('/setup');
  return (
    <div className="relative min-h-svh">
      <div className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex w-full max-w-5xl justify-end px-4 pt-4">
          <PublicPreferences />
        </div>
      </div>
      <main className="mx-auto grid min-h-svh w-full max-w-5xl place-items-center px-4 py-6 sm:py-16">
        {children}
      </main>
    </div>
  );
}
