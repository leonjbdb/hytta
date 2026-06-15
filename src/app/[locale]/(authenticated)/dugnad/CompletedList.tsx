'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DugnadCard } from './DugnadCard';
import type { DugnadRow } from './shared';

const PAGE_SIZE = 20;

interface Props {
  rows: DugnadRow[];
  viewerId: string;
  isAdmin: boolean;
  /** When true, action buttons stack vertically (mobile layout). */
  stackedActions?: boolean;
}

/**
 * Collapsible "completed" section. Renders the first PAGE_SIZE rows up-front
 * and grows the visible window as the sentinel scrolls into view, giving the
 * "infinite bla nedover" feel without paging the server.
 */
export function CompletedList({
  rows,
  viewerId,
  isAdmin,
  stackedActions = false,
}: Props) {
  const t = useTranslations('Dugnad');
  const [open, setOpen] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, rows.length));
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, rows.length, visibleCount]);

  const visible = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        {t('sectionCompleted')} ({rows.length})
      </button>
      {open && (
        <>
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('emptyCompleted')}</p>
          ) : (
            <div className="flex flex-col gap-3 opacity-90">
              {visible.map((row) => (
                <DugnadCard
                  key={row.id}
                  row={row}
                  viewerId={viewerId}
                  isAdmin={isAdmin}
                  inlineActions={!stackedActions}
                />
              ))}
              {hasMore ? (
                <div
                  ref={sentinelRef}
                  className="py-4 text-center text-xs text-[var(--muted-foreground)]"
                >
                  {t('loadingMore')}
                </div>
              ) : (
                <p className="py-2 text-center text-xs text-[var(--muted-foreground)]">
                  {t('endOfList')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
