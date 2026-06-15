import { describe, expect, it } from 'bun:test';
import nb from '@/i18n/messages/nb-NO.json';
import en from '@/i18n/messages/en-GB.json';

type MessageNode = string | { [k: string]: MessageNode };

function flattenKeys(obj: MessageNode, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  return Object.entries(obj).flatMap(([k, v]) =>
    flattenKeys(v as MessageNode, prefix ? `${prefix}.${k}` : k),
  );
}

function flattenStrings(obj: MessageNode, prefix = ''): { path: string; value: string }[] {
  if (typeof obj === 'string') return [{ path: prefix, value: obj }];
  return Object.entries(obj).flatMap(([k, v]) =>
    flattenStrings(v as MessageNode, prefix ? `${prefix}.${k}` : k),
  );
}

describe('i18n message parity', () => {
  it('every nb-NO key exists in en-GB and vice versa', () => {
    const nbKeys = new Set(flattenKeys(nb as MessageNode));
    const enKeys = new Set(flattenKeys(en as MessageNode));

    const missingInEn = [...nbKeys].filter((k) => !enKeys.has(k));
    const missingInNb = [...enKeys].filter((k) => !nbKeys.has(k));

    expect(missingInEn, `keys missing in en-GB:\n${missingInEn.join('\n')}`).toEqual([]);
    expect(missingInNb, `keys missing in nb-NO:\n${missingInNb.join('\n')}`).toEqual([]);
  });
});

describe('Oxford spelling — en-GB.json', () => {
  // Forbidden BrE -ise verbs and their nominal forms; we use Oxford -ize.
  const FORBIDDEN_PATTERNS: { pattern: RegExp; suggestion: string }[] = [
    { pattern: /\borganis(e|ed|es|ing|ation)\b/i, suggestion: 'organize / organization' },
    { pattern: /\brecognis(e|ed|es|ing|ation)\b/i, suggestion: 'recognize / recognition' },
    { pattern: /\brealis(e|ed|es|ing|ation)\b/i, suggestion: 'realize / realization' },
    { pattern: /\bcustomis(e|ed|es|ing|ation)\b/i, suggestion: 'customize' },
    { pattern: /\bauthoris(e|ed|es|ing|ation)\b/i, suggestion: 'authorize' },
    { pattern: /\bcategoris(e|ed|es|ing|ation)\b/i, suggestion: 'categorize' },
    { pattern: /\bmemoris(e|ed|es|ing|ation)\b/i, suggestion: 'memorize' },
    { pattern: /\boptimis(e|ed|es|ing|ation)\b/i, suggestion: 'optimize' },
    { pattern: /\butilis(e|ed|es|ing|ation)\b/i, suggestion: 'utilize' },
  ];

  // Words that MUST be British (not American), to confirm we are not slipping
  // into AmE just because we use -ize.
  const MUST_BE_BRITISH: { wrong: RegExp; right: string }[] = [
    { wrong: /\bcolor\b/i, right: 'colour' },
    { wrong: /\bfavor\b/i, right: 'favour' },
    { wrong: /\bcenter\b/i, right: 'centre' },
    { wrong: /\btheater\b/i, right: 'theatre' },
  ];

  it('no -ise verbs leak into en-GB.json', () => {
    const violations: string[] = [];
    for (const { path, value } of flattenStrings(en as MessageNode)) {
      for (const { pattern, suggestion } of FORBIDDEN_PATTERNS) {
        if (pattern.test(value)) {
          violations.push(`${path}: "${value}" — use ${suggestion}`);
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('no AmE spellings leak into en-GB.json', () => {
    const violations: string[] = [];
    for (const { path, value } of flattenStrings(en as MessageNode)) {
      for (const { wrong, right } of MUST_BE_BRITISH) {
        if (wrong.test(value)) {
          violations.push(`${path}: "${value}" — use "${right}"`);
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
