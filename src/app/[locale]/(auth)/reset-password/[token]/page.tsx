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
import { findValidReset } from '@/lib/auth/password-reset';
import { pickVariant } from '@/lib/device/pick';
import { ResetPassword as ResetDesktop } from './desktop/ResetPassword';
import { ResetPassword as ResetMobile } from './mobile/ResetPassword';

/**
 * Validates the token server-side before rendering the form, so an invalid
 * link short-circuits to a generic "expired" page without exposing the form
 * fields. The form itself re-validates on submit (race-safe via atomic
 * `consumePasswordReset`).
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth');
  const valid = await findValidReset(db, token);

  if (!valid) {
    return (
      <div className="mx-auto mt-12 flex max-w-md flex-col gap-6 px-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('resetInvalidTitle')}</CardTitle>
            <CardDescription>{t('resetInvalidBody')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              {t('forgotCta')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return pickVariant({
    desktop: ResetDesktop,
    mobile: ResetMobile,
    props: { token },
  });
}
