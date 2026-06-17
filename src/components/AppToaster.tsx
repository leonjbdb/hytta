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
 *
 * Below 600px Sonner switches from `offset` to `mobileOffset` (default 16px) —
 * so the header clearance has to be set there too, or mobile toasts float back
 * over the header. Only `top` is overridden (as an object); right/bottom/left
 * fall back to Sonner's 16px default, keeping the stock side margins — those
 * also drive the toast's mobile width, so a blanket string offset would shrink
 * it.
 */
export function AppToaster() {
  return (
    <Toaster
      theme="light"
      position="top-center"
      offset="calc(var(--app-header-height) + 0.75rem)"
      mobileOffset={{ top: 'calc(var(--app-header-height) + 0.75rem)' }}
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
