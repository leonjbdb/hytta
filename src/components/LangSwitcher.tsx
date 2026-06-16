'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown, Globe } from 'lucide-react';
import { type Locale } from '@/i18n/routing';
import { useLocaleSwitch } from './ClientI18nProvider';
import { LOCALES, LOCALE_NATIVE_NAMES, setLocaleCookie } from './LangSwitcher.shared';

/**
 * `<select>`-based language switcher. Used inside the mobile drawer where a
 * native picker is the most ergonomic UX. Desktop renders the same locale
 * options inline within `UserMenu` instead — see `LangSwitcher.shared.ts`.
 */
export function LangSwitcher() {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations('LangSwitcher');

  return (
    <div className="inline-flex items-center gap-2 text-sm">
      <Globe className="size-4 text-[var(--muted-foreground)]" aria-hidden />
      <span className="relative inline-flex items-center">
        <select
          aria-label={t('label')}
          value={locale}
          onChange={(e) => {
            const next = e.target.value as Locale;
            setLocaleCookie(next);
            setLocale(next);
          }}
          className="appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] py-1 pl-2 pr-7 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NATIVE_NAMES[l]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
      </span>
    </div>
  );
}
