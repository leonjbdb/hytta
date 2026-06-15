import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { JetBrains_Mono } from 'next/font/google';
import { themeBootstrapScript } from '@/components/theme-provider';
import { stripExtensionAttrsScript } from '@/lib/strip-extension-attrs';
import { routing } from '@/i18n/routing';
import { cottageNameOrApp } from '@/lib/cottage';
import { requestOrigin } from '@/lib/origin';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const cottageName = await cottageNameOrApp();
  return {
    title: `${cottageName} — Cottage booking`,
    description: 'A quiet cottage retreat. Reserve your stay.',
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: stripExtensionAttrsScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body
        className={`${jetbrainsMono.variable} min-h-dvh antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
