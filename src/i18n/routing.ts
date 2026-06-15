import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['nb-NO', 'en-GB'] as const,
  defaultLocale: 'nb-NO',
  localePrefix: 'never',
  localeDetection: true,
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type Locale = (typeof routing.locales)[number];
