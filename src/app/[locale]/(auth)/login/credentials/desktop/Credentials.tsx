'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { credentialsLogin } from '@/server/actions/auth';

export function Credentials() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mx-auto mt-12 flex max-w-md flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('credentialsTitle')}</CardTitle>
          <CardDescription>{t('credentialsSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await credentialsLogin(fd);
                if (!r.ok) {
                  setError(r.message);
                  return;
                }
                router.push('/dashboard');
                router.refresh();
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-2.5 py-1.5 text-xs text-[var(--destructive)]">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={isPending} className="mt-1">
              {t('credentialsCta')}
            </Button>
          </form>
          <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
            <Link href="/login" className="underline-offset-4 hover:underline">
              {t('magicLinkInsteadLink')}
            </Link>
            <Link href="/forgot-password" className="underline-offset-4 hover:underline">
              {t('forgotPasswordLink')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
