/**
 * Next.js instrumentation — runs once when the server process starts.
 *
 * On Cloudflare Workers the D1 binding only exists inside a request, so there
 * is no database to touch at process-start time. The env test-user
 * reconciliation that used to live here now runs lazily on the first request
 * via the locale layout (see `reconcileTestUser`). This hook is intentionally
 * a no-op, kept as the place for any future non-DB boot wiring.
 */
export async function register(): Promise<void> {
  // no-op
}
