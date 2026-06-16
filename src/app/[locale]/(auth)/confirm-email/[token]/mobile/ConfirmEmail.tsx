'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { confirmEmailChange } from '@/server/actions/user';

export function ConfirmEmail({ token, newEmail }: { token: string; newEmail: string }) {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="mt-6 flex flex-col gap-4 px-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('confirmEmailDoneTitle')}</CardTitle>
            <CardDescription>{t('confirmEmailDoneBody', { email: newEmail })}</CardDescription>
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

  return (
    <div className="mt-6 flex flex-col gap-4 px-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('confirmEmailTitle')}</CardTitle>
          <CardDescription>{t('confirmEmailSubtitle', { email: newEmail })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={(fd) => {
              startTransition(async () => {
                fd.set('token', token);
                const r = await confirmEmailChange(fd);
                if (!r.ok) {
                  toast.error(r.message);
                  return;
                }
                setDone(true);
                router.refresh();
              });
            }}
          >
            <Button type="submit" size="lg" disabled={isPending} className="w-full">
              {t('confirmEmailCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
