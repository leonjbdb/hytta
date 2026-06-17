/**
 * Minimal RFC 5545 iCalendar generator. Tailored to Hytta's domain
 * (all-day VEVENTs, one event per occupancy segment) — not a general-purpose
 * library.
 *
 * Notes:
 *   - All-day events use `DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE`. Per
 *     RFC 5545, DTEND is **exclusive**, so `endDate + 1 day` is correct.
 *   - Every property line is folded at 75 octets with CRLF + a leading space
 *     (RFC 5545 §3.1). The room-grouped descriptions are multi-line and can
 *     exceed 75 octets, so folding is no longer optional.
 *   - Text fields are escaped per RFC 5545 §3.3.11.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  /** Physical place — emitted as `LOCATION`. Skipped when empty. */
  location?: string;
  /** Link back to the app — emitted as `URL`. Skipped when empty. */
  url?: string;
  /** Inclusive start date, ISO `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive end date, ISO `YYYY-MM-DD`. Converted to exclusive in output. */
  endDate: string;
  /** Unix epoch seconds — used for DTSTAMP / LAST-MODIFIED. */
  createdAt: number;
  /**
   * RFC 5545 §3.8.1.11 status. `TENTATIVE` is rendered with a hatched /
   * lighter style by Google Calendar, Apple Calendar, etc. — perfect for
   * "approval pending" bookings.
   */
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
}

const CRLF = '\r\n';

/**
 * Fold a single content line to ≤75 octets per RFC 5545 §3.1. Continuation
 * lines are prefixed with a single space. Folds on UTF-8 byte boundaries so a
 * multi-byte character is never split across a fold.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const pieces: string[] = [];
  let start = 0;
  // First line gets 75 octets; continuation lines get 74 (the leading space
  // counts toward the 75-octet limit).
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte sequence: back up off continuation bytes (10xxxxxx).
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    pieces.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return pieces.join(`${CRLF} `);
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** ISO date `YYYY-MM-DD` → ICS `YYYYMMDD`. */
function dateOnly(iso: string): string {
  return iso.replace(/-/g, '');
}

/** Add one day to an ISO date string. Used to make all-day DTEND exclusive. */
function plusOneDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** UTC stamp `YYYYMMDDTHHMMSSZ` from epoch seconds. */
function utcStamp(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return (
    d.getUTCFullYear().toString().padStart(4, '0') +
    (d.getUTCMonth() + 1).toString().padStart(2, '0') +
    d.getUTCDate().toString().padStart(2, '0') +
    'T' +
    d.getUTCHours().toString().padStart(2, '0') +
    d.getUTCMinutes().toString().padStart(2, '0') +
    d.getUTCSeconds().toString().padStart(2, '0') +
    'Z'
  );
}

export function buildIcs(events: IcsEvent[], calendarName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hytta//Cottage booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Hint to subscribed clients (Apple Calendar honours both) to re-poll
    // hourly rather than their default once-a-day. Google ignores this and
    // uses its own schedule.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${utcStamp(ev.createdAt)}`);
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnly(plusOneDay(ev.endDate))}`);
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    }
    if (ev.location) {
      lines.push(`LOCATION:${escapeText(ev.location)}`);
    }
    if (ev.url) {
      lines.push(`URL:${escapeText(ev.url)}`);
    }
    if (ev.status) {
      lines.push(`STATUS:${ev.status}`);
    }
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // Fold every property line to ≤75 octets before joining (RFC 5545 §3.1).
  return lines.map(foldLine).join(CRLF) + CRLF;
}
