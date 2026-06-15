import * as React from 'react';
import { resolveDeviceVariant, type DeviceVariant } from './resolve';

/**
 * Server helper for `page.tsx` files: picks the right viewport variant and
 * forwards `props` to it. Both variants must accept the same prop shape so
 * data fetching stays in `page.tsx` and is identical across viewports.
 *
 *   return pickVariant({ desktop: FooDesktop, mobile: FooMobile, props });
 */
export async function pickVariant<P extends Record<string, unknown>>({
  desktop: Desktop,
  mobile: Mobile,
  props,
}: {
  desktop: React.ComponentType<P>;
  mobile: React.ComponentType<P>;
  props: P;
}): Promise<React.ReactElement> {
  const v: DeviceVariant = await resolveDeviceVariant();
  const Cmp = v === 'mobile' ? Mobile : Desktop;
  return <Cmp {...props} />;
}
