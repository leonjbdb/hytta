import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { EmailConfig } from '@auth/core/providers';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db, getDb } from '@/db/client';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';
import { isDemoMode } from '@/lib/demo-mode';
import { env } from '@/lib/env';
import { mailer } from '@/lib/email/service';
import { verifyPassword } from '@/lib/auth/password';
import { requestOrigin, withRequestOrigin } from '@/lib/origin';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      isManager: boolean;
      isInvitee: boolean;
    } & DefaultSession['user'];
  }
}

// Lazy (function) config: evaluated per request, so the Drizzle adapter gets a
// REAL request-scoped D1 client (`getDb()`) whose dialect it can detect. A
// module-level instance can't exist — the D1 binding is per-request — and the
// lazy `db` proxy defeats the adapter's construction-time dialect sniffing.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const demo = isDemoMode();
  /*
   * DB-backed password sign-in. In demo mode this is the only provider. In
   * normal mode it stays available from /login/credentials, while the primary
   * /login path remains magic-link.
   */
  const passwordProvider = Credentials({
    name: 'password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    authorize: async (credentials) => {
      const email =
        typeof credentials?.email === 'string'
          ? credentials.email.trim().toLowerCase()
          : '';
      const password =
        typeof credentials?.password === 'string' ? credentials.password : '';
      if (!email || !password) return null;

      const row = (await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.email, email))
        .all())[0];
      if (!row?.passwordHash) return null;
      const ok = await verifyPassword(row.passwordHash, password);
      if (!ok) return null;
      return { id: row.id, email: row.email, name: row.name ?? null };
    },
  });

  const providers = demo
    ? [passwordProvider]
    : [
        /*
         * Magic-link provider. Keep the historical `nodemailer` provider id so
         * existing signIn('nodemailer') call sites keep working, but define the
         * email provider inline instead of importing next-auth's Nodemailer
         * provider. That provider imports the Node-only `nodemailer` package at
         * module load, which breaks Cloudflare Worker bundling even though this
         * app sends through the `mailer` facade.
         */
        {
          id: 'nodemailer',
          type: 'email',
          name: 'Email',
          from: env.EMAIL_FROM,
          // Tighten Auth.js' default 24 h TTL down to 1 h. `maxAge` is in seconds.
          maxAge: 60 * 60,
          sendVerificationRequest: async ({ identifier, url, expires }) => {
            const exists = (await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, identifier))
              .all())[0];
            if (!exists) {
              // Silent: pretend we sent the email so unknown addresses can't be
              // probed by inbox-watching. Auth.js still wrote a verificationToken
              // row; it'll expire harmlessly because no one can click anything.
              return;
            }
            const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
            const locale = cookieLocale === 'en-GB' ? 'en-GB' : 'nb-NO';
            // Point the link at the host the sign-in was requested from (incl.
            // port), not the static AUTH_URL Auth.js used to build it.
            await mailer.sendMagicLink(
              identifier,
              await withRequestOrigin(url),
              locale,
              expires,
            );
          },
        } satisfies EmailConfig,
        passwordProvider,
      ];

  return {
    adapter: demo
      ? undefined
      : DrizzleAdapter(getDb(), {
          usersTable: users,
          accountsTable: accounts,
          sessionsTable: sessions,
          verificationTokensTable: verificationTokens,
        }),
    secret: env.AUTH_SECRET,
    session: { strategy: 'jwt' },
    trustHost: true,
    pages: {
      signIn: '/login',
      verifyRequest: '/login/check-email',
    },
    providers,
    callbacks: {
      /*
       * Resolve every post-auth redirect (sign-in success, sign-out, etc.)
       * against the host the request actually came in on — not the static
       * `AUTH_URL` Auth.js uses as `baseUrl`. So logging out on localhost:3002 or
       * example.com lands back on that same host, never localhost:3000.
       */
      async redirect({ url, baseUrl }) {
        const origin = (await requestOrigin()) || baseUrl;
        // Relative target ("/login", "/dashboard") → resolve onto the request origin.
        if (url.startsWith('/')) return new URL(url, origin).toString();
        try {
          const target = new URL(url);
          // Same app (matches the request origin or the configured base) → keep
          // the path, but serve it from the request origin.
          if (target.origin === origin || target.origin === baseUrl) {
            return new URL(target.pathname + target.search + target.hash, origin).toString();
          }
        } catch {
          // Not a parseable URL — fall through to a safe default.
        }
        // Foreign origin → don't follow it; bounce home on the request origin.
        return origin;
      },
      /*
       * Belt-and-braces invite-only enforcement: the magic-link provider's
       * `sendVerificationRequest` already short-circuits unknown emails, but a
       * signed-in flow that bypassed that gate (or a stale verificationToken)
       * would still be rejected here.
       */
      async signIn({ user, email }) {
        // The email (magic-link) provider runs this callback TWICE: first when
        // the link is REQUESTED (`email.verificationRequest === true`), then
        // again when the link is clicked. Returning false at the request stage
        // makes `signIn` throw, which the login action would surface as an
        // error — leaking whether the address is a member. So allow the request
        // stage (the provider's `sendVerificationRequest` silently sends nothing
        // for unknown emails) and only enforce membership at verification, where
        // a non-member could never arrive anyway since no link was ever sent.
        if (email?.verificationRequest) return true;
        if (!user.email) return false;
        const row = (await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, user.email))
          .all())[0];
        return Boolean(row);
      },
      async jwt({ token, user }) {
        if (user) {
          token.sub = user.id;
        }
        if (!token.sub) return token;

        try {
          const row = (await db
            .select({
              isAdmin: users.isAdmin,
              isManager: users.isManager,
              isInvitee: users.isInvitee,
              email: users.email,
            })
            .from(users)
            .where(eq(users.id, token.sub))
            .all())[0];

          if (!row) {
            // The signed-in user no longer exists — e.g. the account was deleted,
            // or the database was reseeded while a session stayed live. Invalidate
            // the session (return null) so the next request bounces to /login,
            // rather than leaving a "ghost" whose id fails every foreign-key-bound
            // write (creating a booking inserts `bookerId` → user.id and would
            // otherwise blow up with an opaque "Something went wrong").
            return null;
          }

          // Auto-promote any user whose email is in ADMIN_EMAILS so first-time
          // admins don't need a DB edit.
          const allowlist = (env.ADMIN_EMAILS ?? '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          if (
            row.email &&
            allowlist.includes(row.email.toLowerCase()) &&
            !row.isAdmin
          ) {
            await db.update(users).set({ isAdmin: true }).where(eq(users.id, token.sub)).run();
            token.isAdmin = true;
          } else {
            token.isAdmin = Boolean(row.isAdmin);
          }
          token.isManager = Boolean(row.isManager);
          token.isInvitee = Boolean(row.isInvitee);
        } catch (err) {
          if (demo) throw err;
          console.error('[auth.jwt] callback error', err);
          token.isAdmin = false;
          token.isManager = false;
          token.isInvitee = false;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          if (token.sub) session.user.id = token.sub;
          session.user.isAdmin = Boolean((token as { isAdmin?: boolean }).isAdmin);
          session.user.isManager = Boolean((token as { isManager?: boolean }).isManager);
          session.user.isInvitee = Boolean((token as { isInvitee?: boolean }).isInvitee);
        }
        return session;
      },
    },
  };
});
