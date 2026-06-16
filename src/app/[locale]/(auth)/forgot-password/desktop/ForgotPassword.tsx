'use client';

import Link from 'next/link';
import { useTransition } from 'react';
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
import { requestPasswordReset } from '@/server/actions/auth';

export function ForgotPassword() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mx-auto mt-12 flex max-w-md flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('forgotTitle')}</CardTitle>
          <CardDescription>{t('forgotSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3"
            action={(fd) => {
              startTransition(async () => {
                const r = await requestPasswordReset(fd);
                if (!r.ok) {
                  toast.error(r.message);
                  return;
                }
                router.push('/login/check-email');
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <Button type="submit" size="lg" disabled={isPending} className="mt-1">
              {t('forgotCta')}
            </Button>
          </form>
          <p className="text-center text-xs text-[var(--muted-foreground)]">
            <Link href="/login" className="underline-offset-4 hover:underline">
              {t('backToLogin')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
