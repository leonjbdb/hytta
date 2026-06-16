'use client';

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
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-6 flex flex-col gap-4 px-2">
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
              startTransition(async () => {
                fd.set('token', token);
                const r = await acceptInvite(fd);
                if (!r.ok) {
                  toast.error(r.message);
                  return;
                }
                router.push(r.signedIn ? '/dashboard' : '/login/check-email');
              });
            }}
          >
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
            <Button type="submit" size="lg" disabled={isPending} className="mt-1">
              {t('acceptCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
