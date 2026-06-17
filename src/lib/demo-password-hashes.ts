/**
 * GENERATED — do not edit by hand. Run `bun run scripts/gen-demo-hashes.ts`.
 *
 * Precomputed PBKDF2 hashes of the default demo passwords in
 * `demo-constants.ts`, so `createDemoState()` never hashes at runtime (which
 * would blow the Workers Free-plan 10ms CPU cap on every in-isolate rebuild).
 * These cover only the default temp passwords; users can still change theirs.
 */
import { DEMO_ACCOUNT_PASSWORDS } from './demo-constants';

/** PBKDF2 hash of each account's default password, keyed by email. */
export const DEMO_PASSWORD_HASHES: Record<keyof typeof DEMO_ACCOUNT_PASSWORDS, string> = {
  "snow.white@example.com": "pbkdf2$sha256$100000$HXQtKl61i2i6ab+dkJXxBA==$Iw2IaMFkIGB3gNtGdwL8tSSSGCEYmg91oGdXyBT3vFk=",
  "doc@example.com": "pbkdf2$sha256$100000$/3S1B4O9n9WJFEe7G0qOqw==$R6nd5s9ZLrpgzdhk1FmoLCH8e54FVVj51YW0N9ok/nE=",
  "grumpy@example.com": "pbkdf2$sha256$100000$2TjgFQ6RujuVaSThnkbrxA==$wcMCIIBcVb7rmp9L2u4lMd+/JLSFJQcZb56HUJ6bTL4=",
  "happy@example.com": "pbkdf2$sha256$100000$xmyJ1HYEn9YipBy3nsHX0Q==$JZb+8a5mWMHdl9zP3L6fWbufODuDouPa12Z25I7X6zM=",
  "sleepy@example.com": "pbkdf2$sha256$100000$S4XgDLGyVw/ml3HjhSyBkg==$iggmlwSW2NzV18xC2OJoKbnIrxNEW1Tg+bgQl/ezRtA=",
  "bashful@example.com": "pbkdf2$sha256$100000$ex5EHEgxwsv+l9bzYM9ZzQ==$xrSMQ9TPv7xjpIcPjB7jCGmIlXAhabHzcAK+S6uRdVk=",
  "sneezy@example.com": "pbkdf2$sha256$100000$k0gHnrAzXx9fZGmaP58aHg==$p4a3h+X7FQtfJy9yfeGHhelDNhasFz+eS0skS4sUKI4=",
  "dopey@example.com": "pbkdf2$sha256$100000$5HPdYj8bfRmwj52fy/aqNA==$8EjRSjKm85l9+gGbAoeD6bzsqe0u7TzX+i9kRDzLq6o=",
};

/** Hash of the generic fallback password (DEMO_PASSWORD). */
export const DEMO_DEFAULT_PASSWORD_HASH = "pbkdf2$sha256$100000$NYoRrrYhjqgpVR6WmAvZcg==$KDNUKRqCIzs1vYNQV1De6omWR//bkAMlR1Xep2bvH7s=";

/** Precomputed hash for an email, falling back to the generic one. */
export function demoPasswordHashFor(email: string): string {
  return DEMO_PASSWORD_HASHES[email] ?? DEMO_DEFAULT_PASSWORD_HASH;
}
