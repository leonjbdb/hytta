'use client';

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
import { acceptInvite } from '@/server/actions/invitations';

export function AcceptInvite({
  token,
  boundEmail,
}: {
  token: string;
  boundEmail: string | null;
}) {
  const t = useTranslations('Invite');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mx-auto mt-12 flex max-w-md flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('acceptTitle')}</CardTitle>
          <CardDescription>
            {boundEmail ? t('acceptSubtitleBound') : t('acceptSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                fd.set('token', token);
                const r = await acceptInvite(fd);
                if (!r.ok) {
                  setError(r.message);
                  return;
                }
                router.push('/login/check-email');
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">{t('acceptFirstName')}</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">{t('acceptLastName')}</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                />
              </div>
            </div>
            {boundEmail ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t('acceptEmail')}</Label>
                <p className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 px-2.5 py-1.5 text-sm">
                  {boundEmail}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">{t('acceptEmail')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
            )}
            {error && (
              <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-2.5 py-1.5 text-xs text-[var(--destructive)]">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={isPending} className="mt-1">
              {t('acceptCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
