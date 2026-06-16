'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COTTAGE_DESCRIPTION_MAX, COTTAGE_NAME_MAX } from '@/lib/cottage-limits';
import { updateCottage } from '@/server/actions/cottage';

/**
 * Admin-only cottage settings: display name and the link-preview description.
 * The name drives the brand, page title, calendar feeds and emails; the
 * description is the meta/OG text shown when the app is shared in a link. A
 * successful save revalidates the whole tree server-side and we refresh to pull
 * the new brand into the header. Shared by the desktop and mobile admin screens.
 */
export function CottageSettingsForm({
  initialName,
  initialDescription,
}: {
  initialName: string;
  initialDescription: string;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [description, setDescription] = React.useState(initialDescription);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<{ kind: 'ok'; msg: string } | null>(null);

  return (
    <CollapsibleSection title={t('cottageSettingsHeading')}>
      <Card>
        <CardContent className="pt-6">
          <form
            className="flex flex-col gap-3"
            action={(fd) => {
              setStatus(null);
              startTransition(async () => {
                const r = await updateCottage(fd);
                if (r.ok) {
                  setStatus({ kind: 'ok', msg: t('cottageSettingsSaved') });
                  // Pull the new brand into the header (and the rest of the tree).
                  router.refresh();
                } else {
                  toast.error(r.message);
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
                maxLength={COTTAGE_NAME_MAX}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cottage-description">{t('cottageDescriptionLabel')}</Label>
              <Textarea
                id="cottage-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={COTTAGE_DESCRIPTION_MAX}
                placeholder={t('cottageDescriptionPlaceholder')}
              />
              <span className="text-xs text-[var(--muted-foreground)]">
                {t('cottageDescriptionHint')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending || !name.trim()} className="self-start">
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t('saveCottageSettings')}
              </Button>
              {status && (
                <span className="text-xs text-[var(--color-moss-700)]">{status.msg}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}
