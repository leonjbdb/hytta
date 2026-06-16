import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { AppToaster } from '@/components/AppToaster';
import { ClientI18nProvider } from '@/components/ClientI18nProvider';
import { DemoModeToasts } from '@/components/DemoModeToasts';
import { QueryProvider } from '@/components/QueryProvider';
import { routing } from '@/i18n/routing';
import { cottageNameOrApp } from '@/lib/cottage';
import { getDemoResetInfo, isDemoMode } from '@/lib/demo-mode';
import { reconcileTestUser } from '@/lib/bootstrap';
import nbMessages from '@/i18n/messages/nb-NO.json';
import enMessages from '@/i18n/messages/en-GB.json';

export const dynamic = 'force-dynamic';

/**
 * Overlay the operator-chosen cottage name onto a message bundle's
 * `Brand.name`. Both bundles ship to the client (for instant locale switching)
 * so both must carry the same runtime brand.
 */
function withBrand(
  messages: Record<string, unknown>,
  cottageName: string,
): Record<string, unknown> {
  return {
    ...messages,
    Brand: { ...(messages.Brand as Record<string, unknown>), name: cottageName },
  };
}

/**
 * Locale-scoped layout. `<html>` / `<body>` live in the root layout so this
 * stays a pure providers stack. Authentication is enforced one level deeper
 * by `(authenticated)/layout.tsx`.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const demo = isDemoMode();
  if (!demo) await reconcileTestUser();
  const cottageName = await cottageNameOrApp();
  const demoReset = demo ? getDemoResetInfo() : null;
  const messagesByLocale: Record<string, Record<string, unknown>> = {
    'nb-NO': withBrand(nbMessages, cottageName),
    'en-GB': withBrand(enMessages, cottageName),
  };

  return (
    <ClientI18nProvider
      initialLocale={locale}
      messagesByLocale={messagesByLocale}
      timeZone="Europe/Oslo"
    >
      <QueryProvider>
        <ThemeProvider>
          {children}
          <AppToaster />
          {demoReset && <DemoModeToasts resetAt={demoReset.resetAt} />}
        </ThemeProvider>
      </QueryProvider>
    </ClientI18nProvider>
  );
}
