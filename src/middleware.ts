import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';

const intl = createMiddleware(routing);

/**
 * Routes a signed-out user is allowed to hit. Everything else short-circuits
 * to /login so a missing per-page `auth()` check can't accidentally leak the
 * UI or its data. Static assets and API routes are excluded by `config.matcher`
 * below, so they don't need to be listed here.
 *
 * Note on prefixes: each entry is matched both as an exact path and as a
 * prefix (`pathname.startsWith(p + '/')`) so child routes such as
 * `/login/check-email`, `/login/credentials`, `/reset-password/<token>` and
 * `/invite/<token>` don't need individual entries.
 */
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/invite',
  // First-run cottage naming. Must be reachable without a session so a brand-new
  // instance (no users yet) can be set up.
  '/setup',
];

function isPublic(pathname: string) {
  if (pathname === '/') return false;
  for (const p of PUBLIC_PATHS) {
    if (pathname === p) return true;
    if (pathname.startsWith(p + '/')) return true;
  }
  // Allow Auth.js callback handlers (under /api/auth — already excluded by
  // matcher, but defensive).
  if (pathname.startsWith('/api/auth')) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isPublic(pathname)) {
    const token = await getToken({
      req,
      secret: env.AUTH_SECRET,
      // Auth.js v5 default cookie name; matches what the app issues.
      cookieName:
        process.env.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
    });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }
  return intl(req);
}

export const config = {
  matcher: [
    // Exclude API routes, Next internals, and static assets.
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
