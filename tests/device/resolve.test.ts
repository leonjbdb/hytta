import { describe, expect, test } from 'bun:test';
import { classifyUserAgent } from '@/lib/device/resolve';

describe('classifyUserAgent', () => {
  test('iPhone UA → mobile', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(classifyUserAgent(ua)).toBe('mobile');
  });

  test('Android Chrome UA → mobile', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
    expect(classifyUserAgent(ua)).toBe('mobile');
  });

  test('desktop Chrome UA → desktop', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    expect(classifyUserAgent(ua)).toBe('desktop');
  });

  test('iPad UA → desktop (treated as such on purpose)', () => {
    // Modern iPad Safari reports a Mac UA. Mobile-style toggle isn't worth the regex churn.
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    expect(classifyUserAgent(ua)).toBe('desktop');
  });

  test('empty UA → desktop (safe default)', () => {
    expect(classifyUserAgent('')).toBe('desktop');
  });
});
