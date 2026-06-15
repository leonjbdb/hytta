import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { cottageNameOrApp } from '@/lib/cottage';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // The brand shown across the UI is the operator-chosen cottage name (set on
  // first run), not a static string — inject it over the message bundle's
  // `Brand.name` placeholder.
  const messages = (await import(`./messages/${locale}.json`)).default as Record<
    string,
    unknown
  >;
  const merged = {
    ...messages,
    Brand: { ...(messages.Brand as Record<string, unknown>), name: await cottageNameOrApp() },
  };

  return {
    locale,
    messages: merged,
    timeZone: 'Europe/Oslo',
    now: new Date(),
    formats: {
      dateTime: {
        long: {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        },
        short: {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        },
      },
    },
  };
});
