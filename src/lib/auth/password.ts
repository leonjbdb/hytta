/**
 * Password hashing using PBKDF2-HMAC-SHA256 via the Web Crypto API.
 *
 * Cloudflare Workers (workerd) has neither Node's native crypto nor Bun's
 * `Bun.password` (argon2id), so we use `crypto.subtle`, which is available on
 * workerd, Node, and Bun alike. Parameters follow OWASP's 2023 PBKDF2 guidance
 * (≥600k iterations for SHA-256). Hashes are self-describing strings:
 *
 *   pbkdf2$sha256$<iterations>$<salt-b64>$<hash-b64>
 *
 * so the iteration count can be raised over time without breaking older hashes.
 */
const ITERATIONS = 600_000;
const KEY_LEN = 32; // bytes
const SALT_LEN = 16; // bytes

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(
  plain: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plain) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await derive(plain, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    const [scheme, algo, iterStr, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'pbkdf2' || algo !== 'sha256') return false;
    const iterations = Number(iterStr);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const salt = b64ToBytes(saltB64!);
    const expected = b64ToBytes(hashB64!);
    const actual = await derive(plain, salt, iterations);
    if (actual.length !== expected.length) return false;
    // Constant-time comparison.
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
    return diff === 0;
  } catch {
    return false;
  }
}
