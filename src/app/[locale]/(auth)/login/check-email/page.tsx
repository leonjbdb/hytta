import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Static page shown after a successful magic-link / invite-accept / reset
 * request. Copy is intentionally generic — never confirms whether the email
 * was actually sent — so the page can't be used to probe membership.
 */
export default async function CheckEmailPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth');

  return (
    <div className="mx-auto mt-12 flex max-w-md flex-col gap-6 px-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('checkEmailTitle')}</CardTitle>
          <CardDescription>{t('checkEmailBody')}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)]">
          <p>
            <Link
              href="/login"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              {t('backToLogin')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
