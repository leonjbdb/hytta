'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createDugnadAction } from '@/server/actions/dugnad';

export function DugnadCreateForm() {
  const t = useTranslations('Dugnad');
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (title.trim().length === 0 || description.trim().length === 0) return;
    startTransition(async () => {
      const res = await createDugnadAction({ title, description });
      if (!res.ok) {
        toast.error(res.message || t('errorGeneric'));
        return;
      }
      setTitle('');
      setDescription('');
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="dugnad-title" className="text-xs font-medium">
          {t('newTitleLabel')}
        </label>
        <input
          id="dugnad-title"
          type="text"
          maxLength={120}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('newTitlePlaceholder')}
          className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dugnad-description" className="text-xs font-medium">
          {t('newDescriptionLabel')}
        </label>
        <textarea
          id="dugnad-description"
          rows={6}
          maxLength={5000}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('newDescriptionPlaceholder')}
          className="resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="sm">
          <Plus className="size-4" />
          {pending ? t('creating') : t('create')}
        </Button>
      </div>
    </form>
  );
}
