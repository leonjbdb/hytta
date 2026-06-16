import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function localEnvValue(name: string): string {
  const path = resolve('.env.local');
  if (!existsSync(path)) return '';

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match?.[1] !== name) continue;

    let value = (match[2] ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return '';
}

const demoMode =
  (process.env.DEMO ?? localEnvValue('DEMO')).trim().toLowerCase() === 'true';

if (!demoMode) {
  // Makes the Cloudflare bindings (D1, the BOOKING Durable Object, secrets) from
  // wrangler.jsonc available via `getCloudflareContext()` under `next dev`.
  void initOpenNextCloudflareForDev();
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://appleid.cdn-apple.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://appleid.apple.com https://accounts.google.com",
      "frame-src 'self' https://appleid.apple.com https://accounts.google.com",
      "form-action 'self' https://appleid.apple.com https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
