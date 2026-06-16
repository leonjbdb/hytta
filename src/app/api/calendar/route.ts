import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { buildFeed, type FeedScope } from '@/lib/calendar/feed';
import { cottageNameOrApp } from '@/lib/cottage';

/**
 * Public iCal feed endpoint. Authenticates via the per-user `calendar_token`
 * query parameter so calendar apps (Google Calendar, Apple Calendar, etc.)
 * can subscribe without going through the interactive login flow.
 *
 *   GET /api/calendar?token=<calendar_token>&scope=<scope>[&download=1][&locale=nb-NO|en-GB]
 *
 * `scope` is one of `my-stays`, `my-bookings`, `others-bookings`, `everyone`
 * (see `FeedScope`). All but `everyone` are relative to the token's owner.
 *
 * `download=1` returns the same body with `Content-Disposition: attachment`
 * so the browser saves it as a file. Without it, the body is served inline
 * with `Content-Type: text/calendar`, which subscribed calendars expect.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const scopeRaw = url.searchParams.get('scope');
  const wantsDownload = url.searchParams.get('download') === '1';
  const localeRaw = url.searchParams.get('locale');

  if (!token) return badRequest('Missing token');
  const validScopes: readonly FeedScope[] = [
    'my-stays',
    'my-bookings',
    'others-bookings',
    'everyone',
  ];
  if (!validScopes.includes(scopeRaw as FeedScope)) return badRequest('Invalid scope');
  const scope = scopeRaw as FeedScope;
  const locale: 'nb-NO' | 'en-GB' = localeRaw === 'en-GB' ? 'en-GB' : 'nb-NO';

  const user = (await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.calendarToken, token))
    .all())[0];
  if (!user) {
    return new Response('Forbidden', { status: 403 });
  }

  const ics = await buildFeed({
    scope,
    viewerId: user.id,
    locale,
    cottageName: await cottageNameOrApp(),
  });

  const filename = `hytta-${scope}.ics`;
  const headers: Record<string, string> = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'private, no-store',
  };
  if (wantsDownload) {
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  } else {
    headers['Content-Disposition'] = `inline; filename="${filename}"`;
  }

  return new Response(ics, { status: 200, headers });
}
