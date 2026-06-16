import {
  escapeHtml,
  formatExpiry,
  shell,
  shellText,
  type Locale,
  type RenderedEmail,
  type SectionContent,
} from '@/lib/email/shell';

interface LocaleCopy {
  tabLabel: string;
  magicHeading: string;
  magicAction: (cottage: string) => string;
  magicValid: (when: string) => string;
  magicFooter: string;
  magicCta: string;
  inviteHeading: (cottage: string) => string;
  inviteIntro: (from: string, cottage: string) => string;
  inviteAction: string;
  inviteCta: string;
  inviteValid: (when: string) => string;
  resetHeading: string;
  resetAction: (cottage: string) => string;
  resetValid: (when: string) => string;
  resetFooter: string;
  resetCta: string;
  emailChangeHeading: string;
  emailChangeAction: (cottage: string) => string;
  emailChangeValid: (when: string) => string;
  emailChangeFooter: string;
  emailChangeCta: string;
  emailChangedNoticeHeading: string;
  emailChangedNoticeBody: (email: string) => string;
  emailChangedNoticeFooter: string;
  emailChangedNoticeCta: string;
}

const COPY: Record<Locale, LocaleCopy> = {
  'nb-NO': {
    tabLabel: 'Norsk',
    magicHeading: 'Logg inn',
    magicAction: (cottage) => `Trykk på knappen under for å logge inn på ${cottage}.`,
    magicValid: (when) => `Lenken er gyldig til ${when}.`,
    magicFooter: 'Hvis du ikke ba om denne lenken kan du trygt ignorere e-posten.',
    magicCta: 'Logg inn',
    inviteHeading: (cottage) => `Velkommen til ${cottage}`,
    inviteIntro: (from, cottage) => `${from} har invitert deg til ${cottage}.`,
    inviteAction: 'Trykk under for å registrere kontoen din.',
    inviteCta: 'Godta invitasjonen',
    inviteValid: (when) => `Lenken er gyldig til ${when}.`,
    resetHeading: 'Tilbakestill passord',
    resetAction: (cottage) =>
      `Trykk under for å sette et nytt passord på ${cottage}-kontoen din.`,
    resetValid: (when) => `Lenken er gyldig til ${when}.`,
    resetFooter:
      'Hvis du ikke ba om dette kan du ignorere e-posten — passordet ditt er uendret.',
    resetCta: 'Sett nytt passord',
    emailChangeHeading: 'Bekreft ny e-postadresse',
    emailChangeAction: (cottage) =>
      `Trykk under for å bekrefte denne adressen som ny innloggings-e-post for ${cottage}-kontoen din.`,
    emailChangeValid: (when) => `Lenken er gyldig til ${when}.`,
    emailChangeFooter:
      'Hvis du ikke ba om dette kan du ignorere e-posten — adressen din er uendret.',
    emailChangeCta: 'Bekreft e-post',
    emailChangedNoticeHeading: 'Innloggings-e-post endret',
    emailChangedNoticeBody: (email) =>
      `Innloggings-e-posten for kontoen din ble endret til ${email}.`,
    emailChangedNoticeFooter:
      'Var det ikke du som gjorde dette? Kontakt en hytteadmin med en gang — noen kan ha tilgang til kontoen din.',
    emailChangedNoticeCta: 'Åpne innstillinger',
  },
  'en-GB': {
    tabLabel: 'English',
    magicHeading: 'Sign in',
    magicAction: (cottage) => `Click the button below to sign in to ${cottage}.`,
    magicValid: (when) => `The link is valid until ${when}.`,
    magicFooter: "If you didn't request this link you can safely ignore this email.",
    magicCta: 'Sign in',
    inviteHeading: (cottage) => `Welcome to ${cottage}`,
    inviteIntro: (from, cottage) => `${from} has invited you to ${cottage}.`,
    inviteAction: 'Click below to set up your account.',
    inviteCta: 'Accept the invitation',
    inviteValid: (when) => `The link is valid until ${when}.`,
    resetHeading: 'Reset password',
    resetAction: (cottage) =>
      `Click below to set a new password for your ${cottage} account.`,
    resetValid: (when) => `The link is valid until ${when}.`,
    resetFooter:
      "If you didn't request this you can ignore this email — your password is unchanged.",
    resetCta: 'Set new password',
    emailChangeHeading: 'Confirm your new email',
    emailChangeAction: (cottage) =>
      `Click below to confirm this address as the new sign-in email for your ${cottage} account.`,
    emailChangeValid: (when) => `The link is valid until ${when}.`,
    emailChangeFooter:
      "If you didn't request this you can ignore this email — your address is unchanged.",
    emailChangeCta: 'Confirm email',
    emailChangedNoticeHeading: 'Sign-in email changed',
    emailChangedNoticeBody: (email) =>
      `The sign-in email for your account was changed to ${email}.`,
    emailChangedNoticeFooter:
      "Didn't make this change? Contact a cottage admin right away — someone may have access to your account.",
    emailChangedNoticeCta: 'Open settings',
  },
};

const LOCALES: Locale[] = ['nb-NO', 'en-GB'];

/** Subjects are English-only — bilingual subjects looked busy in the inbox. */
const SUBJECTS = {
  magicLink: (cottage: string) => `Sign in to ${cottage}`,
  invite: (cottage: string) => `You're invited to ${cottage}`,
  reset: 'Reset your password',
  emailChange: (cottage: string) => `Confirm your new email for ${cottage}`,
  emailChangedNotice: (cottage: string) => `Your ${cottage} sign-in email was changed`,
} as const;

export function magicLinkEmail(
  url: string,
  primary: Locale,
  expiresAt: Date,
  cottageName: string,
): RenderedEmail {
  const sections: SectionContent[] = LOCALES.map((l) => {
    const c = COPY[l];
    return {
      locale: l,
      tabLabel: c.tabLabel,
      headline: c.magicHeading,
      paragraphs: [c.magicAction(cottageName), c.magicValid(formatExpiry(expiresAt, l))],
      cta: c.magicCta,
      footer: c.magicFooter,
    };
  });
  return {
    subject: SUBJECTS.magicLink(cottageName),
    html: shell(sections, url, primary),
    text: shellText(sections, url, primary),
  };
}

export function inviteEmail(
  url: string,
  fromName: string,
  primary: Locale,
  expiresAt: Date,
  cottageName: string,
): RenderedEmail {
  const safeFrom = `<strong>${escapeHtml(fromName)}</strong>`;
  const htmlSections: SectionContent[] = LOCALES.map((l) => {
    const c = COPY[l];
    return {
      locale: l,
      tabLabel: c.tabLabel,
      headline: c.inviteHeading(cottageName),
      paragraphs: [c.inviteIntro(safeFrom, cottageName), c.inviteAction],
      cta: c.inviteCta,
      footer: c.inviteValid(formatExpiry(expiresAt, l)),
    };
  });
  const textSections: SectionContent[] = LOCALES.map((l) => {
    const c = COPY[l];
    return {
      locale: l,
      tabLabel: c.tabLabel,
      headline: c.inviteHeading(cottageName),
      paragraphs: [c.inviteIntro(fromName, cottageName), c.inviteAction],
      cta: c.inviteCta,
      footer: c.inviteValid(formatExpiry(expiresAt, l)),
    };
  });
  return {
    subject: SUBJECTS.invite(cottageName),
    html: shell(htmlSections, url, primary),
    text: shellText(textSections, url, primary),
  };
}

export function resetPasswordEmail(
  url: string,
  primary: Locale,
  expiresAt: Date,
  cottageName: string,
): RenderedEmail {
  const sections: SectionContent[] = LOCALES.map((l) => {
    const c = COPY[l];
    return {
      locale: l,
      tabLabel: c.tabLabel,
      headline: c.resetHeading,
      paragraphs: [c.resetAction(cottageName), c.resetValid(formatExpiry(expiresAt, l))],
      cta: c.resetCta,
      footer: c.resetFooter,
    };
  });
  return {
    subject: SUBJECTS.reset,
    html: shell(sections, url, primary),
    text: shellText(sections, url, primary),
  };
}

/** Confirmation link sent to the NEW address a member wants to switch to. */
export function emailChangeEmail(
  url: string,
  primary: Locale,
  expiresAt: Date,
  cottageName: string,
): RenderedEmail {
  const sections: SectionContent[] = LOCALES.map((l) => {
    const c = COPY[l];
    return {
      locale: l,
      tabLabel: c.tabLabel,
      headline: c.emailChangeHeading,
      paragraphs: [
        c.emailChangeAction(cottageName),
        c.emailChangeValid(formatExpiry(expiresAt, l)),
      ],
      cta: c.emailChangeCta,
      footer: c.emailChangeFooter,
    };
  });
  return {
    subject: SUBJECTS.emailChange(cottageName),
    html: shell(sections, url, primary),
    text: shellText(sections, url, primary),
  };
}

/**
 * Heads-up sent to the OLD address once an email change is confirmed, so a
 * silent takeover (a hijacked session swapping the login email) can't go
 * unnoticed by the real owner. The CTA points at Settings.
 */
export function emailChangedNoticeEmail(
  newEmail: string,
  settingsUrl: string,
  primary: Locale,
  cottageName: string,
): RenderedEmail {
  const safe = `<strong>${escapeHtml(newEmail)}</strong>`;
  const htmlSections: SectionContent[] = LOCALES.map((l) => {
    const c = COPY[l];
    return {
      locale: l,
      tabLabel: c.tabLabel,
      headline: c.emailChangedNoticeHeading,
      paragraphs: [c.emailChangedNoticeBody(safe)],
      cta: c.emailChangedNoticeCta,
      footer: c.emailChangedNoticeFooter,
    };
  });
  const textSections: SectionContent[] = LOCALES.map((l) => {
    const c = COPY[l];
    return {
      locale: l,
      tabLabel: c.tabLabel,
      headline: c.emailChangedNoticeHeading,
      paragraphs: [c.emailChangedNoticeBody(newEmail)],
      cta: c.emailChangedNoticeCta,
      footer: c.emailChangedNoticeFooter,
    };
  });
  return {
    subject: SUBJECTS.emailChangedNotice(cottageName),
    html: shell(htmlSections, settingsUrl, primary),
    text: shellText(textSections, settingsUrl, primary),
  };
}
