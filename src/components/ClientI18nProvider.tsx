'use client';

import * as React from 'react';
import { NextIntlClientProvider } from 'next-intl';

type Messages = Record<string, unknown>;

interface LocaleContextShape {
  locale: string;
  setLocale: (l: string) => void;
}

const LocaleContext = React.createContext<LocaleContextShape | null>(null);

export function useLocaleSwitch(): LocaleContextShape {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocaleSwitch must be used within ClientI18nProvider');
  }
  return ctx;
}

interface Props {
  initialLocale: string;
  messagesByLocale: Record<string, Messages>;
  timeZone?: string;
  children: React.ReactNode;
}

/**
 * Wraps `NextIntlClientProvider` with a client-side locale switch. Both
 * locale message bundles are shipped to the browser so toggling between them
 * is instant — no `router.refresh()` and therefore no risk of losing
 * in-flight client state (selected dates, room assignments, form input).
 *
 * Server-rendered text uses the cookie-derived locale at render time. After a
 * client-side switch, server-rendered strings stay until the next navigation;
 * the booking flow's interactive parts are all client components, so the user
 * sees the new language immediately where it matters.
 */
export function ClientI18nProvider({
  initialLocale,
  messagesByLocale,
  timeZone,
  children,
}: Props) {
  const [locale, setLocaleState] = React.useState<string>(initialLocale);
  const messages = messagesByLocale[locale] ?? messagesByLocale[initialLocale];

  const setLocale = React.useCallback((next: string) => {
    if (!messagesByLocale[next]) return;
    setLocaleState(next);
    document.documentElement.lang = next;
  }, [messagesByLocale]);

  const value = React.useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
