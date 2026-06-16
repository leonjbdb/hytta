'use client';

import { Toaster } from 'sonner';

/**
 * App-wide Sonner toaster. Mounted once in the locale layout so any client
 * component can call `toast(...)`. Pinned to the light theme (even when the app
 * is in dark mode) so toasts — background, text, close button and hover — stay
 * fully light; the warning amber is tuned in globals.css.
 */
export function AppToaster() {
  return (
    <Toaster
      theme="light"
      position="top-center"
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
