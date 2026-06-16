import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { JetBrains_Mono } from 'next/font/google';
import { themeBootstrapScript } from '@/components/theme-provider';
import { stripExtensionAttrsScript } from '@/lib/strip-extension-attrs';
import { routing } from '@/i18n/routing';
import { cottageDescriptionOrDefault, cottageNameOrApp } from '@/lib/cottage';
import { requestOrigin } from '@/lib/origin';
import './globals.css';

export const dynamic = 'force-dynamic';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const cottageName = await cottageNameOrApp();
  const title = `${cottageName} — Cottage booking`;
  // Operator-configurable, set from the admin page. Falls back to a default
  // built from the cottage name until the operator writes their own.
  const description = await cottageDescriptionOrDefault();
  return {
    title,
    description,
    // Mirror onto Open Graph so link unfurlers (Slack, iMessage, etc.) show it.
    openGraph: { title, description },
    // Resolve OG/canonical URLs against the actual request host, not a fixed URL.
    metadataBase: new URL(await requestOrigin()),
  };
}

/**
 * Root layout. Owns `<html>` / `<body>` per Next's requirement so the locale
 * sub-layout can stay focused on providers and not have to re-wrap them.
 * Picks the initial `lang` attribute from the `NEXT_LOCALE` cookie so SSR
 * renders the right language; the client switcher updates it via
 * `document.documentElement.lang` after mount.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const lang = (routing.locales as readonly string[]).includes(cookieLocale ?? '')
    ? (cookieLocale as string)
    : routing.defaultLocale;

  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className={`${jetbrainsMono.variable} min-h-dvh antialiased`}
        suppressHydrationWarning
      >
        {/*
         * Pre-hydration bootstrap, injected as raw HTML rather than JSX
         * <script> elements — React 19 warns about any rendered <script> child
         * (it won't run on client renders), but inline scripts in the initial
         * server HTML execute during parse, before hydration, which is exactly
         * what these need. The theme script avoids a flash of the wrong colour
         * scheme; the strip-extension script removes attributes injected by
         * browser extensions before React hydrates, avoiding a mismatch.
         * Wrapping them in a div means React only ever sees the div, not a
         * <script> element, so the warning never fires.
         */}
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              `<script>${stripExtensionAttrsScript}</script>` +
              `<script>${themeBootstrapScript}</script>`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
