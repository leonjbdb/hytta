'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestMagicLink } from '@/server/actions/auth';

/**
 * Magic-link form. On success the action always returns `{ ok: true }` even
 * for unknown emails — the route confirmation page is the same regardless,
 * so this client just navigates there. Failure messages only fire for input
 * shape problems (empty / malformed addresses).
 */
export function LoginForm() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) => {
        startTransition(async () => {
          const r = await requestMagicLink(fd);
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
        {t('magicLinkCta')}
      </Button>
    </form>
  );
}
