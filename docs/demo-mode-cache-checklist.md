# Cache-only demo mode checklist

Goal: when demo mode is enabled, the app must not read from or write to D1 or
any email transport. All mutable demo data lives in cache, resets to a clean
default every hour, and users are warned before reset.

## Mode and reset contract

- [x] Add a server-side `DEMO=true` demo-mode flag. Default must be off.
- [x] Demo mode must not require SMTP, Resend, or any email-service variables.
- [x] Demo state must be keyed by the current hourly generation.
- [x] A new hourly generation must start from a clean default state, not a
      mutation of the previous hour.
- [x] The default state must include the current demo seed shape: cottage
      settings, users, rooms, beds, reservations, invitations, groups, and
      dugnad tasks.
- [x] The default state must include hundreds of past bookings, future
      bookings, whole-cottage stays, partial-cottage stays, pending requests,
      cancelled bookings, and no overlapping active stays for the same
      registered user.

## Persistence surfaces that must avoid D1

- [x] `src/db/client.ts`: demo mode must return a cache-backed persistence
      path instead of `env.DB`.
- [x] `scripts/cloudflare.ts`: `DEMO=true` must generate an app Worker config
      without D1 or BookingDO bindings, and D1/DO-only commands must fail
      clearly in demo mode.
- [x] The older local D1 demo loader/reset commands must refuse to run when
      `DEMO=true` is active, so demo mode cannot accidentally seed a database.
- [x] Local `dev` and `preview` helpers must not apply D1 migrations or start
      the BookingDO worker when `DEMO=true`.
- [x] `next.config.ts` must not initialize Cloudflare dev D1/DO bindings when
      running in demo mode.
- [x] App layouts that read the cottage name or demo reset timing must be
      force-dynamic so runtime cache reads are not treated as static prerender
      work during `DEMO=true` builds.
- [x] Cloudflare env typing and production binding access must allow demo app
      config to omit `DB`/`BOOKING`, while non-demo paths fail clearly if those
      bindings are missing.
- [x] Cache-backed demo storage must use Cloudflare `caches.default` directly
      with an explicit Worker cache-storage type, not a database or fallback.
- [x] The cache-backed D1 shim must preserve Drizzle-facing driver contracts
      for booleans and `timestamp_ms` fields so normal app pages keep receiving
      the same shaped values they get from real D1.
- [x] The cache-backed D1 shim must match the Cloudflare D1 TypeScript surface
      used by Drizzle (`prepare`, `batch`, `exec`, `withSession`, `first`,
      `all`, `run`, and `raw`) without binding to real D1.
- [x] The cache-backed D1 shim must support normal Drizzle query-builder
      predicates, ordering, `returning`, conflict updates, and parameterized
      limits used by app pages and actions.
- [x] The cache-backed D1 shim must execute `db.batch()` atomically against a
      cloned state and publish the result only if every statement succeeds.
- [x] `src/lib/auth/config.ts`: demo auth must not require the Drizzle adapter
      or Auth.js verification-token table.
- [x] `src/server/booking/booking-client.ts`: demo booking mutations must stay
      in cache instead of going through the BookingDO D1 worker.
- [x] Demo booking conflict checks and writes must run against one state-bound
      cache snapshot so a failed mutation does not partially write data.
- [x] Registered participants must not be creatable or editable into
      overlapping active bookings, and pending approval must fail if approval
      would overlap an existing confirmed stay for that participant.
- [x] `src/server/booking/booking-do.ts`: production path may keep D1, but demo
      mode must not depend on this Durable Object.
- [x] Modules bundled into the standalone BookingDO worker must not import
      `server-only`, `src/lib/demo-mode.ts`, or cache-demo modules; app callers
      pass demo behavior into shared booking code explicitly.
- [x] App Worker runtime modules must not import the unresolved `server-only`
      marker package; Cloudflare should not need a Wrangler alias for it.
- [x] `src/lib/booking/availability.ts` and
      `src/server/actions/availability.ts`: raw SQL availability/occupancy
      reads must be replaced or routed to cache-aware implementations.
- [x] `src/lib/calendar/feed.ts` and `src/app/api/calendar/route.ts`: calendar
      reads must resolve from cache in demo mode.
- [x] Auth helpers using `users`, `invitations`, `passwordResetTokens`,
      `sessions`, `accounts`, or `verificationTokens` must avoid D1 in demo.
- [x] Admin/settings/groups/dugnad/reservation actions that mutate app data must
      write only to the cache-backed demo state.

## Email and invite behavior

- [x] Invite links must still be creatable from the GUI.
- [x] Email-bound invite sending must be disabled in demo mode.
- [x] Accepting a shareable invite in demo mode must create a cache-backed user.
- [x] Accepting an invite must not send a magic-link email in demo mode.
- [x] Demo login must work without email delivery.
- [x] Demo credential login must not pre-fill the form; desktop must show
      selectable post-it notes, and mobile must hide the full credential list
      behind a reveal button.
- [x] The visible demo credential list must match the seeded Snow White admin
      plus the seven member accounts.
- [x] Password reset and magic-link requests in demo mode must not call email
      providers.
- [x] Auth must not import the stock Nodemailer provider at module load, because
      that pulls Node-only mail code into the Cloudflare Worker bundle.
- [x] Non-demo email sends must fail loudly when the selected provider is not
      configured; only explicit `DEMO=true` may no-op email delivery.
- [x] Magic-link, password-reset, setup, and post-invite sign-in actions must
      not catch missing-provider send failures and report success outside demo.

## Client warnings

- [x] Mount a client Sonner notifier when demo mode is active.
- [x] Show a toast informing users they are in demo mode.
- [x] Show reset-warning toasts 10 minutes, 5 minutes, and 1 minute before the
      next hourly reset.
- [x] The notifier must use server-provided reset timing so all clients warn
      against the same hourly generation.
- [x] The notifier must keep scheduling future hourly reset warnings while a
      tab remains open.

## Manual audit checks

- [x] Search for remaining direct `env.DB` use in app runtime paths.
- [x] Search for remaining direct `drizzleFor(env.DB)` use in demo runtime
      paths.
- [x] Search for direct mail send calls and confirm each is gated or no-op in
      demo mode.
- [x] Confirm non-demo mail transport does not silently log-and-succeed when
      provider credentials are missing.
- [x] Search all `db.` call sites and confirm each has a cache-backed path in
      demo mode.
- [x] Confirm unexpected demo cache/runtime failures are not converted into
      generic fallback responses in the main booking, request, notification,
      and dugnad paths.
- [x] Notification fan-out may stay best-effort in production, but demo mode
      must fail loudly if cache-backed reads or email-template preparation
      fail while creating notifications.
- [x] Confirm no build/test/drizzle/demo command was run during this change.
