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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '@/server/actions/auth';

export function ResetPassword({ token }: { token: string }) {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="mt-6 flex flex-col gap-4 px-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('resetDoneTitle')}</CardTitle>
            <CardDescription>{t('resetDoneBody')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Link
              href="/login/credentials"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              {t('credentialsCta')}
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
          <CardTitle>{t('resetTitle')}</CardTitle>
          <CardDescription>{t('resetSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3"
            action={(fd) => {
              startTransition(async () => {
                fd.set('token', token);
                const r = await resetPassword(fd);
                if (!r.ok) {
                  toast.error(r.message);
                  return;
                }
                setDone(true);
                router.refresh();
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">{t('newPasswordLabel')}</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('passwordHelp')}
              </p>
            </div>
            <Button type="submit" size="lg" disabled={isPending} className="mt-1">
              {t('resetCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
