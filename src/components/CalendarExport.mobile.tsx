/**
 * Mobile leaves the FAB out — the calendar export is reachable from the
 * mobile drawer instead (see `HeaderUI.mobile.tsx`). This file exists so the
 * shared `CalendarExport.tsx` server dispatcher has a real component to
 * pick when the variant is mobile, even if it renders nothing.
 */
export function CalendarExport() {
  return null;
}
