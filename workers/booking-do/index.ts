export { BookingDO } from '@/server/booking/booking-do';

/**
 * Standalone worker that hosts the BookingDO Durable Object.
 *
 * The DO is the single, serialised writer for reservations. It lives in its own
 * worker so it can run on workerd both in production AND under local
 * development — `next dev` (OpenNext) reaches it cross-process via the dev
 * registry, which the single-worker setup couldn't do. The Next app worker
 * binds to `BookingDO` here via `script_name` (see the root wrangler.jsonc).
 *
 * It's reached only through the Durable Object RPC binding, never over HTTP, so
 * the fetch handler is just a guard.
 */
export default {
  fetch(): Response {
    return new Response('BookingDO worker — not an HTTP endpoint', { status: 404 });
  },
};
