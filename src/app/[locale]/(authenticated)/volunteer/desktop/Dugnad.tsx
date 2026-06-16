'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CompletedList } from '../CompletedList';
import { DugnadCard } from '../DugnadCard';
import { DugnadCreateForm } from '../DugnadCreateForm';
import type { DugnadProps } from '../shared';

type Focus = { id: string; seq: number; list: 'open' | 'completed' };

export function Dugnad({ open, completed, viewerId, isAdmin }: DugnadProps) {
  const t = useTranslations('Dugnad');
  const seqRef = React.useRef(0);
  const [focus, setFocus] = React.useState<Focus | null>(null);
  const focusTask = React.useCallback((id: string, list: 'open' | 'completed') => {
    seqRef.current += 1;
    setFocus({ id, seq: seqRef.current, list });
  }, []);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
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
                inlineActions
                onFocus={focusTask}
                focusActive={focus?.list === 'open' && focus.id === row.id}
                focusSeq={focus?.seq ?? 0}
              />
            ))}
          </div>
        )}
      </section>

      <CompletedList
        rows={completed}
        viewerId={viewerId}
        isAdmin={isAdmin}
        highlightId={focus?.list === 'completed' ? focus.id : null}
        focusSeq={focus?.seq ?? 0}
        onFocus={focusTask}
      />
    </div>
  );
}
