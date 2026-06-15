/**
 * Rewrite an absolute URL's origin (and any nested absolute `callbackUrl`) to
 * `origin`, preserving scheme, host AND port, plus the token / path / query.
 * Returns `rawUrl` unchanged if either input can't be parsed or `origin` is
 * empty. Pure — no request/runtime dependencies, so it's unit-testable.
 */
export function rewriteOrigin(rawUrl: string, origin: string): string {
  if (!origin) return rawUrl;
  try {
    const target = new URL(origin);
    const url = new URL(rawUrl);
    // Set hostname + port separately: the `.host` setter leaves the existing
    // port in place when the new value omits one (so a port-3000 URL retargeted
    // to `example.com` would wrongly keep `:3000`). `target.port` is '' for a
    // default-port origin, which clears it.
    url.protocol = target.protocol;
    url.hostname = target.hostname;
    url.port = target.port;
    const callbackUrl = url.searchParams.get('callbackUrl');
    if (callbackUrl && /^https?:\/\//i.test(callbackUrl)) {
      try {
        const cb = new URL(callbackUrl);
        cb.protocol = target.protocol;
        cb.hostname = target.hostname;
        cb.port = target.port;
        url.searchParams.set('callbackUrl', cb.toString());
      } catch {
        // Relative callbackUrl — leave untouched.
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}
