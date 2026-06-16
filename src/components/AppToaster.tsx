'use client';

import { Toaster } from 'sonner';

/**
 * App-wide Sonner toaster. Mounted once in the locale layout so any client
 * component can call `toast(...)`. Pinned to the light theme (even when the app
 * is in dark mode) so toasts — background, text, close button and hover — stay
 * fully light; the warning amber is tuned in globals.css.
 *
 * Top-center toasts are offset clear of the sticky header (which is
 * `--app-header-height` tall) plus a small gap, so they sit below it rather
 * than floating over the nav.
 */
export function AppToaster() {
  return (
    <Toaster
      theme="light"
      position="top-center"
      offset="calc(var(--app-header-height) + 0.75rem)"
      closeButton
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
          borderRadius: '0.75rem',
        },
      }}
    />
  );
}
