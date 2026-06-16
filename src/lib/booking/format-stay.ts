/**
 * Format a stay's date range for display, e.g. "24 Jun—28 Jun" (em dash). Pure —
 * pass the active locale in. Shared by the occupant badges, the pending
 * "awaiting approval" tooltip, and the "booked by multiple people" tooltip so
 * the "when" reads identically everywhere.
 */
export function formatStay(
  occ: { startDate: string; endDate: string },
  locale: string,
): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${fmt(occ.startDate)}—${fmt(occ.endDate)}`;
}
