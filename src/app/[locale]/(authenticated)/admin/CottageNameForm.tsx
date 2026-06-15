'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { renameCottage } from '@/server/actions/cottage';

/**
 * Admin-only cottage rename. The name drives the brand, page title, calendar
 * feeds and emails, so a successful save revalidates the whole tree server-side
 * and we refresh to pull the new brand into the header. Shared by the desktop
 * and mobile admin screens.
 */
export function CottageNameForm({ initialName }: { initialName: string }) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('cottageNameHeading')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          action={(fd) => {
            setStatus(null);
            startTransition(async () => {
              const r = await renameCottage(fd);
              if (r.ok) {
                setStatus({ kind: 'ok', msg: t('cottageNameSaved') });
                // Pull the new brand into the header (and the rest of the tree).
                router.refresh();
              } else {
                setStatus({ kind: 'error', msg: r.message });
              }
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="cottage-name">{t('cottageNameLabel')}</Label>
            <Input
              id="cottage-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || !name.trim()} className="self-start">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t('saveCottageName')}
            </Button>
            {status && (
              <span
                className={
                  status.kind === 'ok'
                    ? 'text-xs text-[var(--color-moss-700)]'
                    : 'text-xs text-[var(--destructive)]'
                }
              >
                {status.msg}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
