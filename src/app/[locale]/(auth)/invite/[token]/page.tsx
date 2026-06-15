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
import { findValidInvitation } from '@/lib/auth/invitations';
import { pickVariant } from '@/lib/device/pick';
import { AcceptInvite as AcceptDesktop } from './desktop/AcceptInvite';
import { AcceptInvite as AcceptMobile } from './mobile/AcceptInvite';

/**
 * Validates the invite server-side before rendering the form. Invalid or
 * exhausted invites short-circuit to a generic "expired" page so attackers
 * can't tell whether a token was real-but-revoked vs. never minted.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Invite');
  const valid = await findValidInvitation(db, token);

  if (!valid) {
    return (
      <div className="mx-auto mt-12 flex max-w-md flex-col gap-6 px-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('acceptInvalidTitle')}</CardTitle>
            <CardDescription>{t('acceptInvalidBody')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Link
              href="/login"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              {t('backToLogin')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return pickVariant({
    desktop: AcceptDesktop,
    mobile: AcceptMobile,
    props: { token, boundEmail: valid.email },
  });
}
