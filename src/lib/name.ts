/**
 * Name helpers shared by the settings/invite forms (which save the parts) and
 * the header (which shows a short label). Pure — safe on server and client.
 */

/** Full display name: "Ola Bjørn Nordmann". */
export function composeName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');
}

/** Short label for tight spots: first given name + last name → "Ola Nordmann". */
export function shortDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const firstGiven = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  const last = (lastName ?? '').trim();
  return [firstGiven, last].filter(Boolean).join(' ');
}
