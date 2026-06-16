import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';

let testUserReconciled = false;

/**
 * The env-defined test account. Identified by a fixed id so the whole account
 * is owned by the environment: it is created/updated when TEST_USER_EMAIL +
 * TEST_USER_PASSWORD are set, and removed when they aren't. No other user is
 * env-managed.
 */
const TEST_USER_ID = 'env-test-user';

/**
 * Reconcile the env test user. Set the email + password env vars to (re)create
 * the account; `TEST_USER_ROLE` (`admin` | `manager` | anything else = normal
 * member) sets its role. Remove either of email/password to delete it.
 *
 * D1 is only reachable inside a request, so (unlike the old boot-time
 * `instrumentation.ts` hook) this is invoked lazily from the locale layout and
 * short-circuits after the first run per worker isolate.
 */
export async function reconcileTestUser(): Promise<void> {
  if (testUserReconciled) return;
  const email = process.env.TEST_USER_EMAIL?.trim();
  const password = process.env.TEST_USER_PASSWORD;
  const role = process.env.TEST_USER_ROLE?.trim().toLowerCase();
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  try {
    if (email && password) {
      const passwordHash = await hashPassword(password);
      await db
        .insert(users)
        .values({
          id: TEST_USER_ID,
          email,
          name: 'Test User',
          passwordHash,
          isAdmin,
          isManager,
          isInvitee: true,
          emailVerified: new Date(),
          firstLoginCompletedAt: Math.floor(Date.now() / 1000),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email,
            name: 'Test User',
            passwordHash,
            isAdmin,
            isManager,
            firstLoginCompletedAt: Math.floor(Date.now() / 1000),
          },
        })
        .run();
    } else {
      // Env removed → drop the managed test user (cascades its sessions).
      await db.delete(users).where(eq(users.id, TEST_USER_ID)).run();
    }
    testUserReconciled = true;
  } catch (err) {
    // During static prerender at build time there's no request scope, so
    // getCloudflareContext()/D1 isn't available — that's expected, not a
    // failure, so don't spam the build log with it. Real runtime errors (a
    // colliding email, an un-migrated DB) still surface.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('getCloudflareContext')) {
      console.error('[bootstrap] reconcileTestUser failed', err);
    }
  }
}
