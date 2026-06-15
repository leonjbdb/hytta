'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalendarExportPanel } from './CalendarExport.shared';

/**
 * Desktop floating-action button. Opens a 22-rem popover anchored bottom-right,
 * dismissed via outside-click or Escape.
 */
export function CalendarExport() {
  const t = useTranslations('CalendarExport');
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col items-end"
      ref={panelRef}
    >
      {open && (
        <div className="mb-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('title')}</h3>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('close')}
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <CalendarExportPanel enabled={open} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('open')}
        title={t('open')}
        className="flex size-12 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg"
      >
        <Calendar className="size-5" />
      </button>
    </div>
  );
}
