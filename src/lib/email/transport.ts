import { env } from '@/lib/env';
import { composeFrom, type OutboundEmail, type Transport } from './from';
import { resendConfigured, resendTransport } from './providers/resend';
import { smtpConfigured, smtpTransport } from './providers/smtp';

export type { OutboundEmail, Transport };

/**
 * Provider-agnostic mail transport. The active provider is chosen by
 * `EMAIL_PROVIDER` (default `resend`); the rest of the app only ever imports
 * `sendMail` and stays unaware of which provider is wired — so there's no
 * vendor lock-in, and adding another provider is a single file under
 * `providers/` plus a branch here.
 *
 * Delivery is recommended, not enforced: when the selected provider isn't
 * configured (e.g. local dev with no keys), the message is logged to stdout and
 * the call resolves, so magic-link / invite / reset flows still work.
 */
export const sendMail: Transport = async (msg: OutboundEmail) => {
  const provider = env.EMAIL_PROVIDER;
  const configured = provider === 'smtp' ? smtpConfigured() : resendConfigured();

  if (!configured) {
    console.info(
      `\n[email] (${provider} not configured — message not sent)\n` +
        `  to:      ${msg.to}\n` +
        `  from:    ${composeFrom(msg.fromName)}\n` +
        `  subject: ${msg.subject}\n\n${msg.text}\n`,
    );
    return;
  }

  if (provider === 'smtp') {
    await smtpTransport(msg);
    return;
  }
  await resendTransport(msg);
};
