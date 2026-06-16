/**
 * Cottage field length limits, shared by UI and server validation.
 *
 * Kept in their own module (with no `server-only` import) so client components
 * — e.g. the admin settings form — can import them without pulling the
 * server-only `cottage.ts` into the browser bundle.
 */

/** Maximum length accepted for a cottage name. */
export const COTTAGE_NAME_MAX = 60;

/** Maximum length accepted for the link-preview description. Kept near the
 *  ~160-char sweet spot search engines and link unfurlers display. */
export const COTTAGE_DESCRIPTION_MAX = 200;
