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
  },
};

const LOCALES: Locale[] = ['nb-NO', 'en-GB'];

/** Subjects are English-only — bilingual subjects looked busy in the inbox. */
const SUBJECTS = {
  magicLink: (cottage: string) => `Sign in to ${cottage}`,
  invite: (cottage: string) => `You're invited to ${cottage}`,
  reset: 'Reset your password',
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
