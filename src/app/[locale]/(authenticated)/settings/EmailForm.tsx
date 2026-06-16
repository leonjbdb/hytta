'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestEmailChange } from '@/server/actions/user';

interface Props {
  currentEmail: string;
  /** Address awaiting confirmation, if a change is already in flight. */
  pendingEmail: string | null;
  /**
   * Demo mode: real emails are never sent and the instance resets on a timer,
   * so the whole form is locked — the input is disabled, submit is blocked, and
   * the matching server action refuses too (defence in depth).
   */
  isDemo: boolean;
}

/**
 * Change the signed-in user's sign-in email. Because login is magic-link based,
 * the swap is verified: submitting only emails a confirmation link to the new
 * address, and the account email changes when that link is clicked. Shared by
 * the desktop and mobile Settings screens so the behaviour stays identical.
 */
export function EmailForm({ currentEmail, pendingEmail, isDemo }: Props) {
  const t = useTranslations('Settings');
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, startTransition] = React.useTransition();
  // Track the just-requested address so the hint updates without a reload.
  const [awaiting, setAwaiting] = React.useState<string | null>(pendingEmail);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">{t('emailHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <a href={`mailto:${currentEmail}`} className="inline-flex min-w-0 max-w-full self-start">
          <Badge className="min-w-0 gap-1.5 bg-[var(--muted)] text-sm font-normal text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_10%)] hover:text-[var(--foreground)]">
            <Mail className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{currentEmail}</span>
          </Badge>
        </a>

        {isDemo ? (
          <p className="rounded-md bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            {t('emailDemoLocked')}
          </p>
        ) : (
          <>
            {awaiting && (
              <p className="flex items-start gap-2 rounded-md bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                <Mail className="mt-0.5 size-4 shrink-0" />
                <span>{t('emailPending', { email: awaiting })}</span>
              </p>
            )}
            <form
              ref={formRef}
              className="flex flex-col gap-3"
              action={(fd) => {
                startTransition(async () => {
                  const r = await requestEmailChange(fd);
                  if (!r.ok) {
                    toast.error(r.message);
                    return;
                  }
                  const next = String(fd.get('email') ?? '').trim().toLowerCase();
                  setAwaiting(next);
                  formRef.current?.reset();
                  toast.success(t('emailRequested'));
                });
              }}
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="settings-email">{t('emailNewLabel')}</Label>
                <Input
                  id="settings-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder={t('emailNewPlaceholder')}
                />
                <p className="text-xs text-[var(--muted-foreground)]">{t('emailHelp')}</p>
              </div>
              <Button type="submit" disabled={pending} className="self-start">
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t('emailCta')}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
