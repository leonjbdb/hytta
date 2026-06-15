'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Download, Link2, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ensureCalendarToken } from '@/server/actions/calendar';

export type CalendarScope = 'me' | 'all';

interface PanelProps {
  /** Auto-fetch the token when this becomes true. Optional — defaults to true. */
  enabled?: boolean;
}

/**
 * Renders the "Export calendar" content (intro, two scope sections, hint).
 * Reused by the desktop FAB popover and by the mobile drawer's calendar
 * sheet — keeps the actual feature in one place.
 */
export function CalendarExportPanel({ enabled = true }: PanelProps) {
  const t = useTranslations('CalendarExport');
  const locale = useLocale();
  const [token, setToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<CalendarScope | null>(null);

  React.useEffect(() => {
    if (!enabled || token) return;
    let cancelled = false;
    (async () => {
      const r = await ensureCalendarToken();
      if (cancelled) return;
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setToken(r.token);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  const buildUrl = (scope: CalendarScope, download: boolean) => {
    if (!token) return '';
    const base = window.location.origin;
    const params = new URLSearchParams({ token, scope, locale });
    if (download) params.set('download', '1');
    return `${base}/api/calendar?${params.toString()}`;
  };

  const onCopy = async (scope: CalendarScope) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(buildUrl(scope, false));
      setCopied(scope);
      window.setTimeout(() => setCopied((s) => (s === scope ? null : s)), 1800);
    } catch {
      setError(t('copyFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">{t('intro')}</p>

      <ScopeSection
        scopeLabel={t('scopeMe')}
        scopeIcon={<User className="size-4" />}
        scopeDescription={t('scopeMeDescription')}
        onDownload={() => {
          if (!token) return;
          window.location.href = buildUrl('me', true);
        }}
        onCopy={() => onCopy('me')}
        disabled={!token}
        downloadLabel={t('download')}
        copyLabel={copied === 'me' ? t('copied') : t('copyUrl')}
        copyDone={copied === 'me'}
      />

      <div className="h-px bg-[var(--border)]" />

      <ScopeSection
        scopeLabel={t('scopeAll')}
        scopeIcon={<Users className="size-4" />}
        scopeDescription={t('scopeAllDescription')}
        onDownload={() => {
          if (!token) return;
          window.location.href = buildUrl('all', true);
        }}
        onCopy={() => onCopy('all')}
        disabled={!token}
        downloadLabel={t('download')}
        copyLabel={copied === 'all' ? t('copied') : t('copyUrl')}
        copyDone={copied === 'all'}
      />

      {error && (
        <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 p-2 text-xs text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}

function ScopeSection({
  scopeLabel,
  scopeIcon,
  scopeDescription,
  onDownload,
  onCopy,
  disabled,
  downloadLabel,
  copyLabel,
  copyDone,
}: {
  scopeLabel: string;
  scopeIcon: React.ReactNode;
  scopeDescription: string;
  onDownload: () => void;
  onCopy: () => void;
  disabled: boolean;
  downloadLabel: string;
  copyLabel: string;
  copyDone: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-[var(--muted-foreground)]">{scopeIcon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{scopeLabel}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{scopeDescription}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={disabled}
          className="w-full justify-center"
        >
          <Download className="size-3.5" /> {downloadLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          disabled={disabled}
          className="w-full justify-center"
        >
          {copyDone ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}{' '}
          {copyLabel}
        </Button>
      </div>
    </section>
  );
}
