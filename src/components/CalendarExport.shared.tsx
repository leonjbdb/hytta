'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, Check, Download, Globe, Link2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ensureCalendarToken } from '@/server/actions/calendar';

export type CalendarScope = 'my-stays' | 'my-bookings' | 'others-bookings' | 'everyone';

/** The four scopes, in slider order, with their icon + i18n keys. */
const SCOPES: ReadonlyArray<{
  id: CalendarScope;
  icon: React.ReactNode;
  labelKey: string;
  descriptionKey: string;
}> = [
  { id: 'my-stays', icon: <User className="size-4" />, labelKey: 'scopeMyStays', descriptionKey: 'scopeMyStaysDescription' },
  { id: 'my-bookings', icon: <CalendarCheck className="size-4" />, labelKey: 'scopeMyBookings', descriptionKey: 'scopeMyBookingsDescription' },
  { id: 'others-bookings', icon: <Users className="size-4" />, labelKey: 'scopeOthersBookings', descriptionKey: 'scopeOthersBookingsDescription' },
  { id: 'everyone', icon: <Globe className="size-4" />, labelKey: 'scopeEveryone', descriptionKey: 'scopeEveryoneDescription' },
];

interface PanelProps {
  /** Auto-fetch the token when this becomes true. Optional — defaults to true. */
  enabled?: boolean;
}

/**
 * Renders the "Export calendar" content: a scope selector plus a single
 * download + single copy-link action that both act on the chosen scope.
 * Reused by the desktop FAB popover and the mobile drawer's calendar sheet.
 */
export function CalendarExportPanel({ enabled = true }: PanelProps) {
  const t = useTranslations('CalendarExport');
  const locale = useLocale();
  const [token, setToken] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<CalendarScope>('my-stays');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || token) return;
    let cancelled = false;
    (async () => {
      const r = await ensureCalendarToken();
      if (cancelled) return;
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setToken(r.token);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  const buildUrl = (download: boolean) => {
    if (!token) return '';
    const params = new URLSearchParams({ token, scope, locale });
    if (download) params.set('download', '1');
    return `${window.location.origin}/api/calendar?${params.toString()}`;
  };

  const selectScope = (next: CalendarScope) => {
    setScope(next);
    // The "Copied" confirmation was for the previous scope's URL.
    setCopied(false);
  };

  const onDownload = () => {
    if (!token) return;
    window.location.href = buildUrl(true);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildUrl(false));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const activeDescriptionKey =
    SCOPES.find((s) => s.id === scope)?.descriptionKey ?? 'scopeMyStaysDescription';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">{t('intro')}</p>

      <div role="radiogroup" aria-label={t('title')} className="grid grid-cols-2 gap-1.5">
        {SCOPES.map((s) => {
          const active = s.id === scope;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectScope(s.id)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-medium leading-tight transition-colors',
                active
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]',
              )}
            >
              <span className={cn('shrink-0', active && 'text-[var(--primary)]')}>{s.icon}</span>
              <span className="whitespace-pre-line">{t(s.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Describes the currently selected scope — both actions below use it. */}
      <p className="text-xs text-[var(--muted-foreground)]">{t(activeDescriptionKey)}</p>

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={!token}
          className="w-full justify-center"
        >
          <Download className="size-3.5" /> {t('download')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          disabled={!token}
          className="w-full justify-center"
        >
          {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}{' '}
          {copied ? t('copied') : t('copyUrl')}
        </Button>
      </div>
    </div>
  );
}
