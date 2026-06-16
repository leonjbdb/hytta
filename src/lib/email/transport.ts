import { env } from '@/lib/env';
import { isDemoMode } from '@/lib/demo-mode';
import type { OutboundEmail, Transport } from './from';
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
 * Outside explicit DEMO=true mode, a selected-but-unconfigured provider is a
 * deployment error. Let it fail loudly so missing delivery credentials do not
 * hide during testing.
 */
export const sendMail: Transport = async (msg: OutboundEmail) => {
  if (isDemoMode()) {
    console.info(
      `\n[email] (demo mode — message not sent)\n` +
        `  to:      ${msg.to}\n` +
        `  subject: ${msg.subject}\n\n${msg.text}\n`,
    );
    return;
  }

  const provider = env.EMAIL_PROVIDER;
  const configured = provider === 'smtp' ? smtpConfigured() : resendConfigured();

  if (!configured) {
    throw new Error(
      `EMAIL_PROVIDER=${provider} is selected but not configured; ` +
        'set the required provider credentials or run with DEMO=true.',
    );
  }

  if (provider === 'smtp') {
    await smtpTransport(msg);
    return;
  }
  await resendTransport(msg);
};
