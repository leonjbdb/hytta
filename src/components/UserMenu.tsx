'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Globe, LogOut, Mail, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleSwitch } from './ClientI18nProvider';
import { LOCALES, LOCALE_NATIVE_NAMES, setLocaleCookie } from './LangSwitcher.shared';
import { type Locale } from '@/i18n/routing';

interface Props {
  name: string;
  /** Full name shown on hover when `name` is a shortened label. */
  fullName?: string;
  isInvitee: boolean;
  signOutAction: () => Promise<void>;
}

export function UserMenu({ name, fullName, isInvitee, signOutAction }: Props) {
  const t = useTranslations('Common');
  const { locale, setLocale } = useLocaleSwitch();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const pickLocale = (next: Locale) => {
    setLocaleCookie(next);
    setLocale(next);
  };

  // Reveal the full name on hover only when it differs from the (possibly
  // shortened) label we show — a title identical to the visible text is
  // redundant and flagged by accessibility checkers.
  const fullNameTitle = fullName && fullName !== name ? fullName : undefined;

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm hover:bg-[var(--muted)]"
      >
        <User className="size-4" />
        <span title={fullNameTitle} className="max-w-[10rem] truncate">
          {name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            // Top padding only: the last item (Sign out) then reaches the menu's
            // bottom edge, so its red hover fills to the rounded corner instead
            // of leaving a white strip below it.
            'absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] pt-1 shadow-lg',
          )}
        >
          <div
            role="presentation"
            className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]"
          >
            <Globe className="size-3.5" />
            {t('language')}
          </div>
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={locale === l}
              onClick={() => pickLocale(l)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--muted)]"
            >
              <span className="inline-flex size-4 items-center justify-center">
                {locale === l && <Check className="size-3.5" />}
              </span>
              {LOCALE_NATIVE_NAMES[l]}
            </button>
          ))}

          {/* No vertical margin: the items above and below sit flush against
              the divider, so their hover fills right up to it with no white gap. */}
          <div className="h-px bg-[var(--border)]" />

          {isInvitee && (
            <Link
              href="/invite"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--muted)]"
            >
              <Mail className="size-4" />
              {t('invite')}
            </Link>
          )}
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--muted)]"
          >
            <Settings className="size-4" />
            {t('settings')}
          </Link>
          {/* Don't close the menu on click — that unmounts the form before
              the server action can fire. The redirect navigates the page
              away on success, so menu state is irrelevant after submit. */}
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <LogOut className="size-4" />
              {t('signOut')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
