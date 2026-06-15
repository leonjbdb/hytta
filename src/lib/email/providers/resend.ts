import { env } from '@/lib/env';
import { composeFrom, type OutboundEmail, type Transport } from '../from';

/** Resend is usable once an API key is present. */
export function resendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/**
 * Send a transactional email via the Resend HTTP API. Works on any runtime
 * (plain `fetch`), including the Cloudflare Worker. Throws on HTTP errors so the
 * caller can decide whether to surface them.
 */
export const resendTransport: Transport = async ({
  to,
  subject,
  html,
  text,
  fromName,
}: OutboundEmail) => {
  const from = composeFrom(fromName);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
};
