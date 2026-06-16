import { setRequestLocale } from 'next-intl/server';
import { demoPasswordFor } from '@/lib/demo-constants';
import { isDemoMode } from '@/lib/demo-mode';
import { pickVariant } from '@/lib/device/pick';
import { Credentials as CredentialsDesktop } from './desktop/Credentials';
import { Credentials as CredentialsMobile } from './mobile/Credentials';

const DEMO_LOGIN_ACCOUNTS: ReadonlyArray<{
  name: string;
  email: string;
  password: string;
  role: 'adminManager' | 'member';
}> = (
  [
    { name: 'Snow White', email: 'snow.white@example.com', role: 'adminManager' },
    { name: 'Doc Chef', email: 'doc@example.com', role: 'member' },
    { name: 'Grumpy Brummbär', email: 'grumpy@example.com', role: 'member' },
    { name: 'Happy Happy', email: 'happy@example.com', role: 'member' },
    { name: 'Sleepy Schlafmütz', email: 'sleepy@example.com', role: 'member' },
    { name: 'Bashful Pimpel', email: 'bashful@example.com', role: 'member' },
    { name: 'Sneezy Hatschi', email: 'sneezy@example.com', role: 'member' },
    { name: 'Dopey Seppl', email: 'dopey@example.com', role: 'member' },
  ] as const
).map((a) => ({ ...a, password: demoPasswordFor(a.email) }));

export default async function CredentialsLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const demo = isDemoMode();
  return pickVariant({
    desktop: CredentialsDesktop,
    mobile: CredentialsMobile,
    props: {
      demoAccounts: demo ? DEMO_LOGIN_ACCOUNTS : [],
    },
  });
}
