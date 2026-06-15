import { redirect } from 'next/navigation';
import { isCottageConfigured } from '@/lib/cottage';

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
  return <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">{children}</main>;
}
