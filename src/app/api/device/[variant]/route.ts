import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEVICE_OVERRIDE_COOKIE } from '@/lib/device/resolve';

/**
 * Endpoint for pinning the device variant override cookie. Visit
 *   /api/device/mobile  → forces mobile layouts
 *   /api/device/desktop → forces desktop layouts
 *   /api/device/clear   → removes the override (back to UA detection)
 *
 * Always redirects to `/` afterwards so the next render uses the new variant.
 * Intended primarily as a QA / dev convenience.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ variant: string }> },
) {
  const { variant } = await params;
  const c = await cookies();
  if (variant === 'mobile' || variant === 'desktop') {
    c.set(DEVICE_OVERRIDE_COOKIE, variant, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax',
    });
  } else if (variant === 'clear') {
    c.delete(DEVICE_OVERRIDE_COOKIE);
  } else {
    return new NextResponse('Unknown variant', { status: 400 });
  }
  return NextResponse.redirect(new URL('/', _req.url));
}
