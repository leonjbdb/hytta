import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth/config';

export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  redirect(session?.user?.id ? '/dashboard' : '/login');
}
