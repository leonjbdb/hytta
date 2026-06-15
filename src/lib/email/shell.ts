/**
 * Domain-agnostic email rendering scaffold.
 *
 * Per-feature templates (`templates/auth.ts`, …) own their own COPY maps and
 * call `shell()` to wrap the body in the project's house style.
 *
 * Both Norwegian and English are rendered into a single message. The
 * `primaryLocale` argument controls which section renders first and is the
 * default-active tab — typically derived from the requester's NEXT_LOCALE
 * cookie, falling back to Norwegian when no signal is available.
 *
 * Theming is fully automatic via `<meta name="color-scheme">` and a
 * `@media (prefers-color-scheme: dark)` block. Apple Mail, iOS Mail, Outlook
 * native, Samsung Mail, and Gmail mobile all honour the recipient's system
 * setting; Gmail web strips the style block entirely and renders the inline
 * light palette, which is the intended fallback.
 */

export type Locale = 'nb-NO' | 'en-GB';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SectionContent {
  locale: Locale;
  /** Tab label, e.g. "Norsk" / "English". */
  tabLabel: string;
  headline: string;
  /** One <p> per array entry. Plain-text version joins with blank lines. */
  paragraphs: string[];
  cta: string;
  /** Footer HTML (may contain links). Reused for plain text unless `footerText` is set. */
  footer: string;
  /** Plain-text footer, used by `shellText` when the HTML footer contains markup. */
  footerText?: string;
}

const LOCALE_KEY: Record<Locale, 'nb' | 'en'> = {
  'nb-NO': 'nb',
  'en-GB': 'en',
};

/**
 * Minimal HTML-entity escape for any user-controlled string interpolated
 * into the HTML body (e.g. an inviter's display name).
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a Date as a localised "valid until …" timestamp. Always rendered in
 * the cottage's home time zone (Europe/Oslo) — HTML email has no JavaScript,
 * so client-side timezone conversion isn't possible; the abbreviation
 * (CET / CEST, DST-aware) tells the recipient which wall clock applies.
 *
 * - nb-NO → "kl. 14:30 05. mai 2026 (CEST)"
 * - en-GB → "14:30 on 5 May 2026 (CEST)"
 */
export function formatExpiry(date: Date, locale: Locale): string {
  const tz = 'Europe/Oslo';

  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const tzAbbrev =
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      timeZoneName: 'short',
      hour: '2-digit',
    })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';

  const year = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
  }).format(date);

  if (locale === 'nb-NO') {
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      day: '2-digit',
    }).format(date);
    const monthLong = new Intl.DateTimeFormat('nb-NO', {
      timeZone: tz,
      month: 'long',
    }).format(date);
    return `kl. ${time} ${day}. ${monthLong} ${year} (${tzAbbrev})`;
  }

  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: 'numeric',
  }).format(date);
  const monthShort = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    month: 'short',
  }).format(date);
  return `${time} on ${day} ${monthShort} ${year} (${tzAbbrev})`;
}

export function shell(
  sections: SectionContent[],
  ctaUrl: string,
  primaryLocale: Locale = 'nb-NO',
): string {
  const ordered = [
    sections.find((s) => s.locale === primaryLocale)!,
    ...sections.filter((s) => s.locale !== primaryLocale),
  ];
  const primaryKey = LOCALE_KEY[primaryLocale];
  const otherKey = primaryKey === 'nb' ? 'en' : 'nb';

  const tabsBar = ordered
    .map((s) => {
      const k = LOCALE_KEY[s.locale];
      return `<label for="bk-lang-${k}" class="bk-tab bk-lang-tab bk-lang-tab-${k}" style="display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;text-decoration:none;background:#ece9e2;color:#1a1a18;margin-right:6px;cursor:pointer;-webkit-user-select:none;user-select:none;">${s.tabLabel}</label>`;
    })
    .join('');

  const renderSection = (s: SectionContent) => {
    const k = LOCALE_KEY[s.locale];
    const paragraphs = s.paragraphs
      .map(
        (p, i) =>
          `<p style="margin:0${i === s.paragraphs.length - 1 ? '' : ' 0 12px'};">${p}</p>`,
      )
      .join('');
    return `
      <tbody class="bk-section bk-section-${k}">
        <tr><td style="padding:24px 24px 8px;">
          <h1 style="margin:0;font-size:20px;color:#1a1a18;">${s.headline}</h1>
        </td></tr>
        <tr><td class="bk-body" style="padding:0 24px 16px;color:#444;line-height:1.5;font-size:14px;">${paragraphs}</td></tr>
        <tr><td style="padding:0 24px 20px;">
          <a class="bk-cta" href="${ctaUrl}" style="display:inline-block;background:#5a7a4f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">${s.cta}</a>
        </td></tr>
        <tr><td class="bk-footer" style="padding:0 24px 24px;color:#888;font-size:12px;line-height:1.5;">${s.footer}</td></tr>
      </tbody>`;
  };

  return `<!doctype html>
<html lang="${primaryLocale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; }

    .bk-lang-radio {
      position: absolute !important;
      left: -9999px !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Language toggle. Primary section visible by default; clicking the
       secondary radio swaps which section is shown. */
    .bk-section-${primaryKey} { display: table-row-group; }
    .bk-section-${otherKey} { display: none; }
    #bk-lang-${otherKey}:checked ~ .bk-page .bk-section-${primaryKey} { display: none !important; }
    #bk-lang-${otherKey}:checked ~ .bk-page .bk-section-${otherKey} { display: table-row-group !important; }

    .bk-lang-tab-${primaryKey} { background: #5a7a4f !important; color: #ffffff !important; }
    #bk-lang-${otherKey}:checked ~ .bk-page .bk-lang-tab-${primaryKey} { background: #ece9e2 !important; color: #1a1a18 !important; }
    #bk-lang-${otherKey}:checked ~ .bk-page .bk-lang-tab-${otherKey} { background: #5a7a4f !important; color: #ffffff !important; }

    a { color: #5a7a4f; }

    @media (prefers-color-scheme: dark) {
      body { background: #100f0c !important; color: #faf8f3 !important; }
      .bk-page { background: #100f0c !important; }
      .bk-card { background: #1c1a14 !important; border-color: #3a3833 !important; }
      .bk-card h1 { color: #faf8f3 !important; }
      .bk-body { color: #d8d3c8 !important; }
      .bk-body strong { color: #ffffff !important; }
      .bk-footer { color: #8a857c !important; }
      .bk-tab { background: #2c2a24 !important; color: #a8a39a !important; }
      .bk-lang-tab-${primaryKey} { background: #5a7a4f !important; color: #ffffff !important; }
      #bk-lang-${otherKey}:checked ~ .bk-page .bk-lang-tab-${primaryKey} { background: #2c2a24 !important; color: #a8a39a !important; }
      #bk-lang-${otherKey}:checked ~ .bk-page .bk-lang-tab-${otherKey} { background: #5a7a4f !important; color: #ffffff !important; }
      .bk-cta { background: #5a7a4f !important; color: #ffffff !important; }
      a { color: #8fb381 !important; }
    }

    /* Outlook.com webmail signals dark mode by adding data-ogsc / data-ogsb
       attributes instead of honouring prefers-color-scheme. Mirror the dark
       palette here so Outlook users see the same theme. */
    [data-ogsc] body, [data-ogsb] body { background: #100f0c !important; color: #faf8f3 !important; }
    [data-ogsc] .bk-page, [data-ogsb] .bk-page { background: #100f0c !important; }
    [data-ogsc] .bk-card, [data-ogsb] .bk-card { background: #1c1a14 !important; border-color: #3a3833 !important; }
    [data-ogsc] .bk-card h1 { color: #faf8f3 !important; }
    [data-ogsc] .bk-body { color: #d8d3c8 !important; }
    [data-ogsc] .bk-body strong { color: #ffffff !important; }
    [data-ogsc] .bk-footer { color: #8a857c !important; }
    [data-ogsc] .bk-tab, [data-ogsb] .bk-tab { background: #2c2a24 !important; color: #a8a39a !important; }
    [data-ogsc] .bk-lang-tab-${primaryKey}, [data-ogsb] .bk-lang-tab-${primaryKey} { background: #5a7a4f !important; color: #ffffff !important; }
    [data-ogsc] .bk-cta, [data-ogsb] .bk-cta { background: #5a7a4f !important; color: #ffffff !important; }
    [data-ogsc] a { color: #8fb381 !important; }
  </style>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;color:#1a1a18;background:#fafaf6;">
  <input class="bk-lang-radio" type="radio" name="bk-lang" id="bk-lang-${primaryKey}" checked>
  <input class="bk-lang-radio" type="radio" name="bk-lang" id="bk-lang-${otherKey}">
  <div class="bk-page" style="background:#fafaf6;padding:24px;">
    <table class="bk-card" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e0;">
      <tbody>
        <tr><td style="padding:18px 24px 4px;">
          <div>${tabsBar}</div>
        </td></tr>
      </tbody>
      ${ordered.map((s) => renderSection(s)).join('')}
    </table>
  </div>
</body>
</html>`.trim();
}

/**
 * Plain-text rendering: stack both language sections separated by a rule.
 * Order matches `shell()` (primary first).
 */
export function shellText(
  sections: SectionContent[],
  ctaUrl: string,
  primaryLocale: Locale = 'nb-NO',
): string {
  const ordered = [
    sections.find((s) => s.locale === primaryLocale)!,
    ...sections.filter((s) => s.locale !== primaryLocale),
  ];
  return ordered
    .map(
      (s) =>
        `[${s.tabLabel}]\n\n${s.headline}\n\n${s.paragraphs.join('\n\n')}\n\n${s.cta}: ${ctaUrl}\n\n${s.footerText ?? s.footer}`,
    )
    .join('\n\n----------------\n\n');
}
