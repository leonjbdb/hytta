import { routing, type Locale } from '@/i18n/routing';

/** Locales known to the app, ordered for menu display. */
export const LOCALES: ReadonlyArray<Locale> = routing.locales;

/**
 * Native names — never translated. Showing "Norsk Bokmål" / "English" lets a
 * user who doesn't speak the current UI language find their preferred locale
 * by sight, regardless of which one is active.
 */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  'nb-NO': 'Norsk Bokmål',
  'en-GB': 'English',
};

/**
 * Persist the chosen locale in the long-lived `NEXT_LOCALE` cookie so SSR on
 * subsequent navigations matches the client. Must run in the browser.
 */
export function setLocaleCookie(locale: Locale): void {
  document.cookie = `NEXT_LOCALE=${locale}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;
}
