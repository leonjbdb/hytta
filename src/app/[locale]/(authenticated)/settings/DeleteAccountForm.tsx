'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ConfirmDialog';
import { deleteOwnAccount } from '@/server/actions/user';

/**
 * Danger zone: lets a user permanently delete their own account. Confirmed with
 * a forced 3-second wait (irreversible). On success the action signs them out
 * and redirects, so only an error (e.g. last admin) ever lands back here.
 * Shared by the desktop and mobile Settings screens.
 */
export function DeleteAccountForm() {
  const t = useTranslations('Settings');
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();

  return (
    <Card className="border-[var(--destructive)]/40">
      <CardHeader>
        <CardTitle as="h2" className="text-base text-[var(--destructive)]">
          {t('deleteAccountHeading')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">{t('deleteAccountHint')}</p>
        <Button
          variant="destructive"
          className="self-start"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              message: t('confirmDeleteAccount'),
              confirmLabel: t('deleteAccountCta'),
              destructive: true,
              delaySeconds: 3,
            });
            if (!ok) return;
            startTransition(async () => {
              const r = await deleteOwnAccount();
              if (!r.ok) toast.error(r.message);
            });
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
          {t('deleteAccountCta')}
        </Button>
      </CardContent>
    </Card>
  );
}
