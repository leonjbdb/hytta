import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/db/client';
import { findValidEmailChange } from '@/lib/auth/email-change';
import { pickVariant } from '@/lib/device/pick';
import { ConfirmEmail as ConfirmDesktop } from './desktop/ConfirmEmail';
import { ConfirmEmail as ConfirmMobile } from './mobile/ConfirmEmail';

/**
 * Validates the email-change token server-side before rendering, so a stale or
 * tampered link short-circuits to a generic "invalid" page. The actual swap
 * happens on the explicit button submit (POST) rather than on this GET, so an
 * inbox link-scanner prefetch can't consume the token. The submit re-validates
 * race-safely via the atomic `consumeEmailChange`.
 */
export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth');
  const valid = await findValidEmailChange(db, token);

  if (!valid) {
    return (
      <div className="mx-auto mt-12 flex max-w-md flex-col gap-6 px-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('confirmEmailInvalidTitle')}</CardTitle>
            <CardDescription>{t('confirmEmailInvalidBody')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Link
              href="/settings"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              {t('confirmEmailSettingsCta')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return pickVariant({
    desktop: ConfirmDesktop,
    mobile: ConfirmMobile,
    props: { token, newEmail: valid.newEmail },
  });
}
