import { resolveDeviceVariant } from '@/lib/device/resolve';
import { CalendarExport as CalendarExportDesktop } from './CalendarExport.desktop';
import { CalendarExport as CalendarExportMobile } from './CalendarExport.mobile';

/**
 * Server-component dispatcher: picks the FAB on desktop, returns nothing on
 * mobile (the drawer surfaces the same feature there).
 */
export async function CalendarExport() {
  const variant = await resolveDeviceVariant();
  return variant === 'mobile' ? <CalendarExportMobile /> : <CalendarExportDesktop />;
}
