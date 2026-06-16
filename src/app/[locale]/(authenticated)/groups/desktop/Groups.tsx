'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createGroup, type GroupSummary } from '@/server/actions/groups';

export function Groups({ groups }: { groups: GroupSummary[] }) {
  const t = useTranslations('Groups');
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const r = await createGroup({ name });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      router.push(`/groups/${r.data.id}`);
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{t('subtitle')}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
          {t('myGroups')}
        </h2>
        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-[var(--muted-foreground)]">
              {t('emptyMyGroups')}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm hover:bg-[var(--muted)]/40"
              >
                <Users className="size-4 text-[var(--muted-foreground)]" />
                <span className="flex-1 font-medium">{g.name}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {t('memberCount', { count: g.memberCount })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
          {t('newGroup')}
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-group-name">{t('groupName')}</Label>
              <Input
                id="new-group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('groupNamePlaceholder')}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={submit} disabled={pending || !name.trim()}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                <Plus className="size-4" />
                {t('createGroup')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
