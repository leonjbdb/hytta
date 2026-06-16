'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Client component so the copy follows the client-side language switch
 * (`ClientI18nProvider`). A server component reading `getTranslations` would
 * stay in the cookie-derived locale until the next navigation — this page has
 * no in-flight state to preserve, so reacting instantly is the right call.
 */
export function CheckEmailCard() {
  const t = useTranslations('Auth');

  return (
    <div className="flex w-full justify-center px-2 py-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">{t('checkEmailTitle')}</CardTitle>
          <CardDescription>{t('checkEmailBody')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            {t('checkEmailCloseHint')}
          </p>
          <Link href="/login" className={buttonVariants({ className: 'w-full' })}>
            {t('backToLogin')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
