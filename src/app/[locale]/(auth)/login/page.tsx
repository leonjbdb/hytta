import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth/config';
import { pickVariant } from '@/lib/device/pick';
import { Login as LoginDesktop } from './desktop/Login';
import { Login as LoginMobile } from './mobile/Login';

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return pickVariant({ desktop: LoginDesktop, mobile: LoginMobile, props: {} });
}
