export const DEMO_RESET_INTERVAL_MS = 60 * 60 * 1000;
/** Fallback for any demo account not listed in DEMO_ACCOUNT_PASSWORDS. */
export const DEMO_PASSWORD = 'password';

/**
 * Per-account demo passwords, keyed by email. Each account gets a distinct,
 * memorable password. Single source of truth shared by the seed (local D1 *and*
 * the in-memory demo-mode state) and the login page, so the password printed on
 * a note always matches the stored hash and actually logs you in.
 */
export const DEMO_ACCOUNT_PASSWORDS: Record<string, string> = {
  'snow.white@example.com': 'poison-apple',
  'doc@example.com': 'spectacles',
  'grumpy@example.com': 'humph',
  'happy@example.com': 'tra-la-la',
  'sleepy@example.com': 'forty-winks',
  'bashful@example.com': 'aw-shucks',
  'sneezy@example.com': 'gesundheit',
  'dopey@example.com': 'gigglewater',
};

/** The demo password for an email, falling back to the generic one. */
export function demoPasswordFor(email: string): string {
  return DEMO_ACCOUNT_PASSWORDS[email] ?? DEMO_PASSWORD;
}

export const DEMO_WARNING_OFFSETS_MS = [
  10 * 60 * 1000,
  5 * 60 * 1000,
  60 * 1000,
] as const;
