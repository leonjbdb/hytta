/**
 * Minimal RFC 5545 iCalendar generator. Tailored to Hytta's domain
 * (all-day VEVENTs, one event per booking) — not a general-purpose library.
 *
 * Notes:
 *   - All-day events use `DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE`. Per
 *     RFC 5545, DTEND is **exclusive**, so `endDate + 1 day` is correct.
 *   - Lines longer than 75 octets are folded with CRLF + space, but our
 *     summaries/descriptions are short enough that we skip folding for
 *     simplicity. Calendar apps tolerate slightly long lines in practice.
 *   - Text fields are escaped per RFC 5545 §3.3.11.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
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
    if (ev.status) {
      lines.push(`STATUS:${ev.status}`);
    }
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}
