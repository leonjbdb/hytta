import { setRequestLocale } from 'next-intl/server';
import { pickVariant } from '@/lib/device/pick';
import { ForgotPassword as ForgotDesktop } from './desktop/ForgotPassword';
import { ForgotPassword as ForgotMobile } from './mobile/ForgotPassword';

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return pickVariant({
    desktop: ForgotDesktop,
    mobile: ForgotMobile,
    props: {},
  });
}
