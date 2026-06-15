import { setRequestLocale } from 'next-intl/server';
import { pickVariant } from '@/lib/device/pick';
import { Credentials as CredentialsDesktop } from './desktop/Credentials';
import { Credentials as CredentialsMobile } from './mobile/Credentials';

export default async function CredentialsLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return pickVariant({
    desktop: CredentialsDesktop,
    mobile: CredentialsMobile,
    props: {},
  });
}
