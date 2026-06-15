import { describe, it, expect } from 'bun:test';
import { rewriteOrigin } from '@/lib/url';

const MAGIC =
  'http://localhost:3000/api/auth/callback/nodemailer' +
  '?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fdashboard&token=abc123&email=a%40b.no';

describe('rewriteOrigin', () => {
  it('swaps host+port and preserves the token', () => {
    const out = new URL(rewriteOrigin(MAGIC, 'http://localhost:3002'));
    expect(out.host).toBe('localhost:3002');
    expect(out.protocol).toBe('http:');
    expect(out.searchParams.get('token')).toBe('abc123');
    expect(out.searchParams.get('email')).toBe('a@b.no');
  });

  it('rewrites the nested absolute callbackUrl to the same origin', () => {
    const out = new URL(rewriteOrigin(MAGIC, 'http://localhost:3002'));
    expect(out.searchParams.get('callbackUrl')).toBe('http://localhost:3002/dashboard');
  });

  it('handles a production https host with no port', () => {
    const out = new URL(rewriteOrigin(MAGIC, 'https://example.com'));
    expect(out.protocol).toBe('https:');
    expect(out.host).toBe('example.com');
    expect(out.searchParams.get('callbackUrl')).toBe('https://example.com/dashboard');
  });

  it('leaves a relative callbackUrl untouched', () => {
    const raw = 'http://localhost:3000/invite/tok?callbackUrl=%2Fdashboard';
    const out = new URL(rewriteOrigin(raw, 'http://localhost:3002'));
    expect(out.host).toBe('localhost:3002');
    expect(out.searchParams.get('callbackUrl')).toBe('/dashboard');
  });

  it('returns the input unchanged when origin is empty', () => {
    expect(rewriteOrigin(MAGIC, '')).toBe(MAGIC);
  });

  it('returns the input unchanged when the URL is unparseable', () => {
    expect(rewriteOrigin('not a url', 'http://localhost:3002')).toBe('not a url');
  });
});
