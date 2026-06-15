import {
  escapeHtml,
  shell,
  shellText,
  type Locale,
  type RenderedEmail,
  type SectionContent,
} from '@/lib/email/shell';

/**
 * Opt-in notification emails (booking status, new requests, role changes).
 * They reuse the bilingual themed shell from the auth emails — same house
 * style, same nb/en toggle, same dark-mode handling. Every message carries a
 * footer pointing back to Settings so it never feels like spam.
 */

export type BookingStatus = 'approved' | 'rejected' | 'cancelled';
export type Role = 'admin' | 'manager';

const LOCALES: Locale[] = ['nb-NO', 'en-GB'];
const TAB: Record<Locale, string> = { 'nb-NO': 'Norsk', 'en-GB': 'English' };

const NOTIFY_FOOTER: Record<Locale, string> = {
  'nb-NO': 'Klikk her for å endre varslingsinnstillinger',
  'en-GB': 'Click here to edit notification settings',
};

/** Footer fields for a section: a clickable link in HTML, a plain URL in text. */
function notifyFooter(locale: Locale, settingsUrl: string): {
  footer: string;
  footerText: string;
} {
  const label = NOTIFY_FOOTER[locale];
  return {
    footer: `<a href="${settingsUrl}">${label}</a>`,
    footerText: `${label}: ${settingsUrl}`,
  };
}

/** Format a closed ISO date range as a short, localised string. */
function formatDateRange(startIso: string, endIso: string, locale: Locale): string {
  const intlLocale = locale === 'nb-NO' ? 'nb-NO' : 'en-GB';
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${iso}T00:00:00Z`));
  return startIso === endIso ? fmt(startIso) : `${fmt(startIso)} – ${fmt(endIso)}`;
}

// ---------------------------------------------------------------------------
// Booking status — to the person who created the booking.
// ---------------------------------------------------------------------------

const BOOKING_COPY: Record<
  Locale,
  {
    cta: (cottage: string) => string;
    approved: { heading: string; body: (range: string) => string };
    rejected: { heading: string; body: (range: string) => string };
    cancelled: { heading: string; body: (range: string) => string };
  }
> = {
  'nb-NO': {
    cta: (c) => `Åpne ${c}`,
    approved: {
      heading: 'Reservasjon bekreftet',
      body: (r) => `Reservasjonen din for ${r} er godkjent.`,
    },
    rejected: {
      heading: 'Reservasjon avslått',
      body: (r) => `Reservasjonen din for ${r} ble dessverre avslått.`,
    },
    cancelled: {
      heading: 'Reservasjon avbestilt',
      body: (r) => `Reservasjonen din for ${r} har blitt avbestilt.`,
    },
  },
  'en-GB': {
    cta: (c) => `Open ${c}`,
    approved: {
      heading: 'Booking confirmed',
      body: (r) => `Your booking for ${r} has been approved.`,
    },
    rejected: {
      heading: 'Booking declined',
      body: (r) => `Your booking for ${r} was declined.`,
    },
    cancelled: {
      heading: 'Booking cancelled',
      body: (r) => `Your booking for ${r} has been cancelled.`,
    },
  },
};

const BOOKING_SUBJECT: Record<BookingStatus, string> = {
  approved: 'Booking confirmed',
  rejected: 'Booking declined',
  cancelled: 'Booking cancelled',
};

export function bookingStatusEmail(
  kind: BookingStatus,
  startIso: string,
  endIso: string,
  ctaUrl: string,
  settingsUrl: string,
  primary: Locale,
  cottage: string,
): RenderedEmail {
  const sections: SectionContent[] = LOCALES.map((l) => {
    const c = BOOKING_COPY[l];
    return {
      locale: l,
      tabLabel: TAB[l],
      headline: c[kind].heading,
      paragraphs: [c[kind].body(formatDateRange(startIso, endIso, l))],
      cta: c.cta(cottage),
      ...notifyFooter(l, settingsUrl),
    };
  });
  return {
    subject: BOOKING_SUBJECT[kind],
    html: shell(sections, ctaUrl, primary),
    text: shellText(sections, ctaUrl, primary),
  };
}

// ---------------------------------------------------------------------------
// New booking request — to managers.
// ---------------------------------------------------------------------------

const REQUEST_COPY: Record<
  Locale,
  { heading: string; body: (name: string, range: string) => string; cta: string }
> = {
  'nb-NO': {
    heading: 'Ny forespørsel',
    body: (n, r) => `${n} har bedt om en reservasjon for ${r}. Den venter på godkjenning.`,
    cta: 'Se forespørsler',
  },
  'en-GB': {
    heading: 'New booking request',
    body: (n, r) => `${n} requested a booking for ${r}. It is waiting for approval.`,
    cta: 'Review requests',
  },
};

export function bookingRequestEmail(
  bookerName: string,
  startIso: string,
  endIso: string,
  ctaUrl: string,
  settingsUrl: string,
  primary: Locale,
): RenderedEmail {
  const build = (safeName: string): SectionContent[] =>
    LOCALES.map((l) => {
      const c = REQUEST_COPY[l];
      return {
        locale: l,
        tabLabel: TAB[l],
        headline: c.heading,
        paragraphs: [c.body(safeName, formatDateRange(startIso, endIso, l))],
        cta: c.cta,
        ...notifyFooter(l, settingsUrl),
      };
    });
  return {
    subject: 'New booking request',
    html: shell(build(`<strong>${escapeHtml(bookerName)}</strong>`), ctaUrl, primary),
    text: shellText(build(bookerName), ctaUrl, primary),
  };
}

// ---------------------------------------------------------------------------
// Role change — to the affected user (admin / manager only; never inviter).
// ---------------------------------------------------------------------------

const ROLE_COPY: Record<
  Locale,
  {
    cta: (cottage: string) => string;
    admin: {
      granted: { heading: string; body: (c: string) => string };
      revoked: { heading: string; body: (c: string) => string };
    };
    manager: {
      granted: { heading: string; body: (c: string) => string };
      revoked: { heading: string; body: (c: string) => string };
    };
  }
> = {
  'nb-NO': {
    cta: (c) => `Åpne ${c}`,
    admin: {
      granted: {
        heading: 'Du er nå administrator',
        body: (c) => `Du har fått administratortilgang til ${c}.`,
      },
      revoked: {
        heading: 'Administratortilgang fjernet',
        body: (c) => `Administratortilgangen din til ${c} har blitt fjernet.`,
      },
    },
    manager: {
      granted: {
        heading: 'Du er nå reservasjonsansvarlig',
        body: (c) => `Du kan nå godkjenne reservasjoner på ${c}.`,
      },
      revoked: {
        heading: 'Reservasjonsansvar fjernet',
        body: (c) => `Du er ikke lenger reservasjonsansvarlig på ${c}.`,
      },
    },
  },
  'en-GB': {
    cta: (c) => `Open ${c}`,
    admin: {
      granted: {
        heading: "You're now an admin",
        body: (c) => `You've been given admin access to ${c}.`,
      },
      revoked: {
        heading: 'Admin access removed',
        body: (c) => `Your admin access to ${c} has been removed.`,
      },
    },
    manager: {
      granted: {
        heading: "You're now a booking manager",
        body: (c) => `You can now approve bookings for ${c}.`,
      },
      revoked: {
        heading: 'Booking manager access removed',
        body: (c) => `You're no longer a booking manager for ${c}.`,
      },
    },
  },
};

function roleSubject(role: Role, granted: boolean): string {
  if (role === 'admin') return granted ? "You're now an admin" : 'Admin access removed';
  return granted ? "You're now a booking manager" : 'Booking manager access removed';
}

export function roleChangedEmail(
  role: Role,
  granted: boolean,
  ctaUrl: string,
  settingsUrl: string,
  primary: Locale,
  cottage: string,
): RenderedEmail {
  const sections: SectionContent[] = LOCALES.map((l) => {
    const c = ROLE_COPY[l];
    const r = c[role][granted ? 'granted' : 'revoked'];
    return {
      locale: l,
      tabLabel: TAB[l],
      headline: r.heading,
      paragraphs: [r.body(cottage)],
      cta: c.cta(cottage),
      ...notifyFooter(l, settingsUrl),
    };
  });
  return {
    subject: roleSubject(role, granted),
    html: shell(sections, ctaUrl, primary),
    text: shellText(sections, ctaUrl, primary),
  };
}
