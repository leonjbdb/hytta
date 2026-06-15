import { env } from '@/lib/env';
import { composeFrom, type OutboundEmail, type Transport } from '../from';

/** SMTP is usable once a host is configured. */
export function smtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let cachedTransporter: any;

async function getTransporter(): Promise<any> {
  if (cachedTransporter) return cachedTransporter;
  // Variable specifier so the bundler leaves this as a runtime import, keeping
  // nodemailer — a Node-only package that can't run on the Cloudflare Worker —
  // out of the Worker bundle entirely.
  const moduleName = 'nodemailer';
  let nodemailer: any;
  try {
    nodemailer = await import(moduleName);
  } catch {
    throw new Error(
      "EMAIL_PROVIDER=smtp requires the 'nodemailer' package and a Node runtime " +
        '(self-hosted / `bun run start`). It cannot run on the Cloudflare Worker — ' +
        'use EMAIL_PROVIDER=resend there.',
    );
  }
  const createTransport = nodemailer.createTransport ?? nodemailer.default?.createTransport;
  cachedTransporter = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return cachedTransporter;
}

export const smtpTransport: Transport = async ({
  to,
  subject,
  html,
  text,
  fromName,
}: OutboundEmail) => {
  const transporter = await getTransporter();
  await transporter.sendMail({ from: composeFrom(fromName), to, subject, html, text });
};
/* eslint-enable @typescript-eslint/no-explicit-any */
