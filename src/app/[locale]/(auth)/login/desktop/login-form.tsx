'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await requestMagicLink(fd);
          if (!r.ok) {
            setError(r.message);
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
      {error && (
        <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-2.5 py-1.5 text-xs text-[var(--destructive)]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isPending} className="mt-1">
        {t('magicLinkCta')}
      </Button>
    </form>
  );
}
