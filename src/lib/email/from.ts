import { env } from '@/lib/env';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Optional From display name. The address always comes from `EMAIL_FROM`
   * (it must stay on a verified sender domain); only the human-readable name
   * shown in the inbox is overridden — e.g. the cottage name.
   */
  fromName?: string;
}

export type Transport = (msg: OutboundEmail) => Promise<void>;

/**
 * Build the From header. Keeps the address from `EMAIL_FROM` and swaps in
 * `fromName` as the display name when provided. Falls back to `EMAIL_FROM`
 * verbatim if it can't extract an address.
 */
export function composeFrom(fromName?: string): string {
  if (!fromName) return env.EMAIL_FROM;
  const address = env.EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? env.EMAIL_FROM.trim();
  return `${fromName} <${address}>`;
}
