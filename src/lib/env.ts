import { z } from 'zod';

/**
 * Strict environment validation. Parsed once at module load — if any required
 * variable is missing or malformed, the process throws before any HTTP handler
 * runs. This is the implementation of the "require all creds at startup"
 * contract from the booking-app plan.
 */
const EnvSchema = z.object({
  // Database: the app talks to Cloudflare D1 through the `DB` binding
  // (wrangler.jsonc), resolved per-request via `getDb()` — there is no
  // DATABASE_URL connection string to validate here.

  // Auth.js core
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars'),
  AUTH_URL: z.string().url(),

  /**
   * From-address for outbound mail. Must use a domain you've verified in
   * Resend (https://resend.com/domains) — the API rejects unverified senders.
   * Display name optional: `Hytta <noreply@example.com>`. (The cottage name is
   * substituted at send time, so the display name here is only a fallback.)
   */
  EMAIL_FROM: z.string().min(1),

  /**
   * Resend HTTP API key (https://resend.com/api-keys). Optional in dev:
   * when empty, outbound mail logs to the server console instead of being
   * sent, so you can sign in / accept invites / reset passwords without
   * configuring a real mailbox.
   */
  RESEND_API_KEY: z.string().optional().default(''),

  /**
   * Outbound email transport — no vendor lock-in. `resend` (default,
   * recommended) sends via the Resend HTTP API and runs anywhere, including the
   * Cloudflare Worker. `smtp` sends via nodemailer and therefore only works on a
   * Node runtime (self-hosted / `bun run start`), NOT on the Worker, which can't
   * open raw SMTP sockets. When the selected provider isn't configured, mail is
   * logged to the console and never blocks the app (delivery is recommended,
   * not enforced).
   */
  EMAIL_PROVIDER: z.enum(['resend', 'smtp']).optional().default('resend'),

  // SMTP settings — only used when EMAIL_PROVIDER=smtp (Node runtime only).
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /**
   * Comma-separated emails that are auto-promoted to admin on every sign-in.
   * Useful for bootstrapping the very first admin without DB surgery — once
   * a user's email matches, the JWT callback flips `users.is_admin = 1`.
   */
  ADMIN_EMAILS: z.string().optional().default(''),

  /**
   * Env-managed test account. The only user a real (otherwise-empty)
   * deployment may carry: when both EMAIL and PASSWORD are set, the app
   * (re)creates a single fixed account on first request and removes it again
   * once either is cleared. Reconciled in `src/lib/bootstrap.ts`, which reads
   * `process.env` directly — these are declared here only to document and
   * validate the contract. ROLE: `admin` | `manager` | anything else = member.
   */
  TEST_USER_EMAIL: z.string().optional().default(''),
  TEST_USER_PASSWORD: z.string().optional().default(''),
  // Free-form: bootstrap treats `admin`/`manager` specially, anything else
  // (incl. empty) as a normal member — so don't constrain to an enum here, or
  // the shipped empty `TEST_USER_ROLE=` would fail boot validation.
  TEST_USER_ROLE: z.string().optional().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(env)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `\n[hytta] Invalid environment configuration:\n${issues}\n\n` +
        `Local dev: copy .env.example to .env.local and fill every required variable.\n` +
        `Cloudflare: set the same names as Worker Variables and Secrets.\n`,
    );
  }
  return parsed.data;
}

// Validate at import time so failures happen at boot, not on first request.
// During Next.js linting/type-checking we skip validation to allow tooling
// to run without a populated .env.local.
export const env: Env =
  process.env.SKIP_ENV_VALIDATION === '1'
    ? (process.env as unknown as Env)
    : loadEnv();
