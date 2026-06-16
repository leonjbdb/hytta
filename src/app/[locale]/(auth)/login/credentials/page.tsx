import { setRequestLocale } from 'next-intl/server';
import { DEMO_PASSWORD } from '@/lib/demo-constants';
import { isDemoMode } from '@/lib/demo-mode';
import { pickVariant } from '@/lib/device/pick';
import { Credentials as CredentialsDesktop } from './desktop/Credentials';
import { Credentials as CredentialsMobile } from './mobile/Credentials';

const DEMO_LOGIN_ACCOUNTS = [
  {
    name: 'Snow White',
    email: 'snow.white@example.com',
    password: DEMO_PASSWORD,
    role: 'adminManager',
  },
  { name: 'Doc Chef', email: 'doc@example.com', password: DEMO_PASSWORD, role: 'member' },
  {
    name: 'Grumpy Brummbär',
    email: 'grumpy@example.com',
    password: DEMO_PASSWORD,
    role: 'member',
  },
  { name: 'Happy Happy', email: 'happy@example.com', password: DEMO_PASSWORD, role: 'member' },
  {
    name: 'Sleepy Schlafmütz',
    email: 'sleepy@example.com',
    password: DEMO_PASSWORD,
    role: 'member',
  },
  {
    name: 'Bashful Pimpel',
    email: 'bashful@example.com',
    password: DEMO_PASSWORD,
    role: 'member',
  },
  {
    name: 'Sneezy Hatschi',
    email: 'sneezy@example.com',
    password: DEMO_PASSWORD,
    role: 'member',
  },
  { name: 'Dopey Seppl', email: 'dopey@example.com', password: DEMO_PASSWORD, role: 'member' },
] as const;

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
