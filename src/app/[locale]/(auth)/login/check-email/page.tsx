import { setRequestLocale } from 'next-intl/server';
import { CheckEmailCard } from './CheckEmailCard';

/**
 * Static page shown after a successful magic-link / invite-accept / reset
 * request. Copy is intentionally generic — never confirms whether the email
 * was actually sent — so the page can't be used to probe membership. The card
 * itself is a client component so its language follows the in-page switcher.
 */
export default async function CheckEmailPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CheckEmailCard />;
}
