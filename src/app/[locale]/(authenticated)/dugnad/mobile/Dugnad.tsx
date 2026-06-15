'use client';

import { useTranslations } from 'next-intl';
import { CompletedList } from '../CompletedList';
import { DugnadCard } from '../DugnadCard';
import { DugnadCreateForm } from '../DugnadCreateForm';
import type { DugnadProps } from '../shared';

/**
 * Mobile dugnad: same data, restacked for narrow screens.
 *   - Title + create form take full width with no side padding gutter
 *   - Action buttons stack vertically inside each card so the tap target
 *     never gets squeezed below ~44px high
 */
export function Dugnad({ open, completed, viewerId, isAdmin }: DugnadProps) {
  const t = useTranslations('Dugnad');
  return (
    <div className="mx-auto flex w-full flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{t('subtitle')}</p>
      </header>

      <DugnadCreateForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
          {t('sectionOpen')} ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">{t('emptyOpen')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {open.map((row) => (
              <DugnadCard
                key={row.id}
                row={row}
                viewerId={viewerId}
                isAdmin={isAdmin}
                inlineActions={false}
              />
            ))}
          </div>
        )}
      </section>

      <CompletedList
        rows={completed}
        viewerId={viewerId}
        isAdmin={isAdmin}
        stackedActions
      />
    </div>
  );
}
