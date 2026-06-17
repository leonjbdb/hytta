'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { DEVICE_OVERRIDE_COOKIE, type DeviceVariant } from '@/lib/device/variant';

// Tailwind's `md` breakpoint — the same 768px line the Header's desktop/mobile
// controls toggle on (`md:hidden` / `hidden md:flex`), so the page body and the
// header chrome always agree on which variant the viewport should show.
const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Keeps the server-rendered body variant in step with the viewport width.
 *
 * Page bodies choose their desktop/mobile variant on the SERVER from the
 * User-Agent (`pickVariant` → `resolveDeviceVariant`) so only one variant ever
 * ships. But that decision is baked into the cached RSC payload and never
 * re-evaluates when the viewport later crosses the breakpoint — a DevTools
 * device toggle, a window resize, or "Request desktop site" leaves e.g. the
 * desktop dashboard rendered at phone width (which overflows horizontally)
 * until a manual refresh, and disagreeing with the width-based Header.
 *
 * This watches the `md` media query and, whenever the viewport disagrees with
 * the variant that was rendered, pins the matching variant via the override
 * cookie and calls `router.refresh()` to re-fetch the correct one. A real
 * phone (mobile UA at phone width) already agrees, so it never fires; only a
 * genuine viewport/variant mismatch triggers exactly one corrective refresh.
 */
export function DeviceVariantSync({ variant }: { variant: DeviceVariant }) {
  const router = useRouter();

  React.useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const reconcile = () => {
      const wanted: DeviceVariant = mql.matches ? 'desktop' : 'mobile';
      if (wanted === variant) return;
      // Session cookie (no Max-Age): pins the variant for this browsing session
      // so reloads keep the resized view, without leaking the choice into a
      // fresh session. `resolveDeviceVariant` reads this ahead of the UA.
      document.cookie = `${DEVICE_OVERRIDE_COOKIE}=${wanted}; path=/; samesite=lax`;
      router.refresh();
    };
    reconcile();
    mql.addEventListener('change', reconcile);
    return () => mql.removeEventListener('change', reconcile);
  }, [variant, router]);

  return null;
}
